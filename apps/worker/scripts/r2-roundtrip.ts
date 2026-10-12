/**
 * Manual check of the video pipeline against the real R2 bucket and a real database (not a unit test).
 *
 *   bun --env-file=../../.env scripts/r2-roundtrip.ts      (from apps/worker)
 *
 * Needs DATABASE_URL (a migrated database) and R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY,
 * R2_BUCKET. It creates a throwaway user and video row, uploads a generated clip to a fresh
 * `raw/<uuid>/source.mp4`, runs processVideo, checks the outputs, round-trips a 12 MB file to test the
 * multipart upload path, and then deletes every object and row it created (and only those).
 */
import { spawnSync } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DeleteObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { Db, Users, Videos } from '@ttg/db';
import { keys } from '@ttg/shared';
import { Effect, Layer } from 'effect';
import { probe } from '../src/ffmpeg';
import { processVideo } from '../src/process-video';
import { r2ConfigFromEnv, Storage } from '../src/storage';

const DATABASE_URL = process.env.DATABASE_URL;
const r2 = r2ConfigFromEnv(process.env);
if (!DATABASE_URL || !r2.ok) {
	console.error(`Missing environment variables: ${[...(DATABASE_URL ? [] : ['DATABASE_URL']), ...(r2.ok ? [] : r2.missing)].join(', ')}`);
	process.exit(1);
}
const config = r2.config;

const dir = mkdtempSync(join(tmpdir(), 'ttg-r2-roundtrip-'));
const clip = join(dir, 'clip.mp4');
const gen = spawnSync('ffmpeg', [
	'-hide_banner', '-loglevel', 'error', '-y',
	'-f', 'lavfi', '-i', 'testsrc=duration=3:size=640x360:rate=30',
	'-f', 'lavfi', '-i', 'sine=frequency=440:duration=3',
	'-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', clip
]);
if (gen.status !== 0) throw new Error(`could not generate the clip: ${gen.stderr}`);

const s3 = Storage.makeS3Client(config);
const Bucket = config.bucket;
const created: string[] = [];
const exists = async (key: string) => {
	try {
		const r = await s3.send(new HeadObjectCommand({ Bucket, Key: key }));
		return { size: r.ContentLength ?? 0, type: r.ContentType };
	} catch (e) {
		if ((e as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404) return undefined;
		throw e;
	}
};
const check = (ok: boolean, what: string) => {
	console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
	if (!ok) process.exitCode = 1;
};

const videoId = randomUUID();
const sourceKey = keys.rawSource(videoId, 'mp4');
const bigKey = keys.rawSource(randomUUID(), 'mp4');
const clerkUserId = `r2-roundtrip-${randomUUID()}`;
const outputKeys = [keys.processedVideo(videoId), keys.poster(videoId), keys.sprite(videoId), keys.spriteVtt(videoId)];

const program = Effect.gen(function* () {
	const storage = yield* Storage;
	const users = yield* Users;
	const videos = yield* Videos;
	const db = yield* Db;

	const owner = yield* users.ensure({ clerkUserId, role: 'player' });
	const cleanupRows = Effect.gen(function* () {
		yield* db.query(`delete from videos where id = $1`, [videoId]);
		yield* db.query(`delete from users where id = $1`, [owner.id]);
		console.log('ok   deleted the test video and user rows');
	});

	yield* Effect.gen(function* () {
		yield* videos.create({ id: videoId, ownerId: owner.id, kind: 'swing', sourceKey, sizeBytes: readFileSync(clip).length });
		yield* videos.markUploaded(videoId, readFileSync(clip).length);

		created.push(sourceKey);
		yield* storage.upload(sourceKey, clip, 'video/mp4');
		const sourceBefore = yield* Effect.promise(() => exists(sourceKey));
		check(sourceBefore !== undefined, `uploaded the source to ${sourceKey}`);

		created.push(...outputKeys);
		const started = Date.now();
		const outcome = yield* processVideo(videoId, { retryCount: 0, retryLimit: 3 }, {
			workDir: join(dir, 'work'),
			threads: 2,
			transcodeTimeoutMs: 120_000,
			stepTimeoutMs: 60_000
		});
		check(outcome._tag === 'Ready', `processVideo -> ${outcome._tag} in ${Date.now() - started} ms`);

		const row = (yield* videos.find(videoId))!;
		check(row.status === 'ready', `row status ${row.status}, ${row.width}x${row.height} @ ${row.fps} fps, ${row.durationMs} ms`);
		for (const key of outputKeys) {
			const o = yield* Effect.promise(() => exists(key));
			check(o !== undefined && o.size > 0, `${key} exists (${o?.size ?? 0} bytes, ${o?.type})`);
		}
		const sourceAfter = yield* Effect.promise(() => exists(sourceKey));
		check(sourceAfter?.size === sourceBefore?.size, 'source still exists, unchanged size');

		const back = join(dir, 'back.mp4');
		yield* storage.download(keys.processedVideo(videoId), back);
		const info = yield* probe(back);
		check(info.videoCodec === 'h264' && info.audioCodec === 'aac', `downloaded output is ${info.videoCodec}/${info.audioCodec}`);

		// Multipart path (files over 10 MB): upload and download 12 MB and compare hashes.
		const big = join(dir, 'big.bin');
		writeFileSync(big, randomBytes(12 * 1024 * 1024));
		created.push(bigKey);
		yield* storage.upload(bigKey, big, 'application/octet-stream');
		const bigBack = join(dir, 'big-back.bin');
		yield* storage.download(bigKey, bigBack);
		const sha = (p: string) => createHash('sha256').update(readFileSync(p)).digest('hex');
		check(sha(big) === sha(bigBack), '12 MB multipart upload round-trips byte for byte');
	}).pipe(Effect.ensuring(cleanupRows.pipe(Effect.orDie)));
}).pipe(
	Effect.provide(
		Layer.mergeAll(Users.layer, Videos.layer).pipe(
			Layer.provideMerge(Db.layerFromUrl(DATABASE_URL, { max: 2 })),
			Layer.merge(Storage.layerFromConfig(config))
		)
	)
);

try {
	await Effect.runPromise(program);
} catch (e) {
	process.exitCode = 1;
	console.error('FAIL', e);
} finally {
	// Only objects this script created: the throwaway raw uploads and the outputs for its own video id.
	for (const key of created) {
		await s3.send(new DeleteObjectCommand({ Bucket, Key: key })).catch((e) => console.error(`could not delete ${key}:`, e));
	}
	const left = (await Promise.all(created.map(async (k) => ((await exists(k)) ? k : undefined)))).filter(Boolean);
	check(left.length === 0, `deleted the ${created.length} objects this script created`);
	rmSync(dir, { recursive: true, force: true });
}
