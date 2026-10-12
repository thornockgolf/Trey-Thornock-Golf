import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assert, layer } from '@effect/vitest';
import { Db, Users, Videos } from '@ttg/db';
import { TestDb } from '@ttg/db/testing';
import { keys } from '@ttg/shared';
import { Effect, Exit, Fiber, Layer } from 'effect';
import { afterAll, beforeAll } from 'vitest';
import { spriteLayout } from './ffmpeg';
import { processVideo, type Attempt, type ProcessConfig } from './process-video';
import { Storage } from './storage';
import { ffprobeJson, frameDurations, keyframeTimes, makeFixtures, topLevelBoxes, type Fixtures } from './test-fixtures';

let root: string;
let fx: Fixtures;
beforeAll(() => {
	root = mkdtempSync(join(tmpdir(), 'ttg-worker-test-'));
	fx = makeFixtures(root);
}, 120_000);
afterAll(() => rmSync(root, { recursive: true, force: true }));

const FIRST: Attempt = { retryCount: 0, retryLimit: 3 };
const LAST: Attempt = { retryCount: 3, retryLimit: 3 };
const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const Live = Layer.mergeAll(Users.layer, Videos.layer).pipe(Layer.provideMerge(TestDb));

/** A fresh `uploaded` video whose source (one of the fixtures) is in a fresh in-memory bucket. */
const setup = (n: number, fixture: string) =>
	Effect.gen(function* () {
		const users = yield* Users;
		const videos = yield* Videos;
		const owner = yield* users.ensure({ clerkUserId: `worker_${n}`, role: 'player' });
		const ext = fixture.split('.').pop() as 'mp4' | 'mov' | 'webm';
		const sourceKey = keys.rawSource(ID(n), ext);
		yield* videos.create({ id: ID(n), ownerId: owner.id, kind: 'swing', sourceKey, sizeBytes: 1 });
		yield* videos.markUploaded(ID(n), 1);
		const mem = Storage.makeMemory();
		const source = new Uint8Array(readFileSync(fixture));
		mem.objects.set(sourceKey, { body: source, contentType: 'video/mp4' });
		const workDir = mkdtempSync(join(root, `work-${n}-`));
		const config: ProcessConfig = { workDir, threads: 2, transcodeTimeoutMs: 120_000, stepTimeoutMs: 60_000 };
		const run = (attempt: Attempt = FIRST) =>
			processVideo(ID(n), attempt, config).pipe(Effect.provideService(Storage, mem.service));
		return { id: ID(n), sourceKey, source, mem, workDir, config, run, videos };
	});

/** Write an object from the fake bucket to disk so ffprobe can read it. */
const toFile = (mem: ReturnType<typeof Storage.makeMemory>, key: string, name: string) => {
	const o = mem.objects.get(key);
	assert.isDefined(o, `missing object ${key}`);
	const path = join(root, `${Math.random().toString(36).slice(2)}-${name}`);
	writeFileSync(path, o!.body);
	return path;
};

layer(Live, { timeout: 180_000 })('processVideo', (it) => {
	it.effect('happy path: ready row, keys, H.264/AAC <= 1080p CFR with a keyframe every 0.5 s, faststart, poster, sprite + VTT', () =>
		Effect.gen(function* () {
			const t = yield* setup(1, fx.basic);
			const outcome = yield* t.run();
			assert.deepStrictEqual(outcome, { _tag: 'Ready' });

			const v = (yield* t.videos.find(t.id))!;
			assert.strictEqual(v.status, 'ready');
			assert.isNull(v.errorCode);
			assert.strictEqual(v.processedKey, keys.processedVideo(t.id));
			assert.strictEqual(v.thumbnailKey, keys.poster(t.id));
			assert.strictEqual(v.spriteKey, keys.sprite(t.id));
			assert.strictEqual(v.sourceKey, t.sourceKey);
			assert.strictEqual(v.width, 1280);
			assert.strictEqual(v.height, 720);
			assert.strictEqual(v.fps, 30);
			assert.isTrue(Number.isInteger(v.durationMs));
			assert.approximately(v.durationMs!, 4000, 100);

			// content types and the full object set: the source plus the four outputs, nothing deleted
			assert.deepStrictEqual([...t.mem.objects.keys()].sort(), [
				keys.poster(t.id), keys.processedVideo(t.id), keys.sprite(t.id), keys.spriteVtt(t.id), t.sourceKey
			].sort());
			assert.strictEqual(t.mem.objects.get(keys.processedVideo(t.id))!.contentType, 'video/mp4');
			assert.strictEqual(t.mem.objects.get(keys.spriteVtt(t.id))!.contentType, 'text/vtt');
			assert.deepStrictEqual(t.mem.objects.get(t.sourceKey)!.body, t.source);
			assert.deepStrictEqual(t.mem.log.filter((l) => l.op === 'download').map((l) => l.key), [t.sourceKey]);

			const mp4 = toFile(t.mem, keys.processedVideo(t.id), 'video.mp4');
			const info = ffprobeJson(mp4, '-show_streams', '-show_format');
			const vs = info.streams.find((s: { codec_type: string }) => s.codec_type === 'video');
			const as = info.streams.find((s: { codec_type: string }) => s.codec_type === 'audio');
			assert.strictEqual(vs.codec_name, 'h264');
			assert.strictEqual(vs.pix_fmt, 'yuv420p');
			assert.strictEqual(as.codec_name, 'aac');
			assert.strictEqual(vs.avg_frame_rate, '30/1');
			assert.strictEqual(frameDurations(mp4).length, 1, 'constant frame rate');
			const kf = keyframeTimes(mp4);
			assert.deepStrictEqual(kf, [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5]);
			const boxes = topLevelBoxes(mp4);
			assert.isBelow(boxes.indexOf('moov'), boxes.indexOf('mdat'), 'faststart: moov before mdat');

			const poster = ffprobeJson(toFile(t.mem, keys.poster(t.id), 'poster.jpg'), '-show_streams').streams[0];
			assert.strictEqual(poster.codec_name, 'mjpeg');
			assert.strictEqual(poster.width, 1280);

			const layout = spriteLayout(v.durationMs!, 1280, 720);
			const sprite = ffprobeJson(toFile(t.mem, keys.sprite(t.id), 'sprite.jpg'), '-show_streams').streams[0];
			assert.strictEqual(sprite.width, layout.columns * layout.tileWidth);
			assert.strictEqual(sprite.height, layout.rows * layout.tileHeight);
			const vtt = new TextDecoder().decode(t.mem.objects.get(keys.spriteVtt(t.id))!.body);
			assert.isTrue(vtt.startsWith('WEBVTT\n\n'));
			const cues = vtt.trim().split('\n\n').slice(1);
			assert.strictEqual(cues.length, layout.count);
			for (const cue of cues) {
				const m = /^(\d\d:\d\d:\d\d\.\d{3}) --> (\d\d:\d\d:\d\d\.\d{3})\nsprite\.jpg#xywh=(\d+),(\d+),(\d+),(\d+)$/.exec(cue);
				assert.isNotNull(m, cue);
				const [x, y, w, h] = m!.slice(3).map(Number) as [number, number, number, number];
				assert.isAtMost(x + w, sprite.width);
				assert.isAtMost(y + h, sprite.height);
				assert.isTrue(m![1]! < m![2]!, cue);
			}

			assert.deepStrictEqual(readdirSync(t.workDir), [], 'temp dir removed');
		}));

	it.effect('running again is a no-op; a rerun after a crash overwrites the same keys', () =>
		Effect.gen(function* () {
			const t = yield* setup(2, fx.basic);
			yield* t.run();
			const before = new Map(t.mem.objects);
			assert.deepStrictEqual(yield* t.run(), { _tag: 'Skipped' });
			assert.deepStrictEqual(t.mem.objects, before);
			// a worker that died mid-job leaves the row `processing`; the pg-boss retry processes it again
			const db = yield* Db;
			yield* db.query(`update videos set status = 'processing' where id = $1`, [t.id]);
			assert.deepStrictEqual(yield* t.run({ retryCount: 1, retryLimit: 3 }), { _tag: 'Ready' });
			assert.deepStrictEqual([...t.mem.objects.keys()].sort(), [...before.keys()].sort());
			assert.strictEqual((yield* t.videos.find(t.id))!.status, 'ready');
			assert.deepStrictEqual(readdirSync(t.workDir), []);
		}));

	it.effect('variable frame rate source becomes constant frame rate', () =>
		Effect.gen(function* () {
			const t = yield* setup(3, fx.vfr);
			assert.isAbove(frameDurations(fx.vfr).length, 1, 'fixture is VFR');
			yield* t.run();
			const v = (yield* t.videos.find(t.id))!;
			assert.strictEqual(v.status, 'ready');
			assert.strictEqual(v.fps, 29.97);
			const mp4 = toFile(t.mem, keys.processedVideo(t.id), 'vfr.mp4');
			assert.strictEqual(frameDurations(mp4).length, 1);
			const kf = keyframeTimes(mp4);
			// keyframe spacing in frames: exactly 15 at 29.97 fps (0.5005 s)
			const gaps = new Set(kf.slice(1).map((k, i) => Math.round(((k - kf[i]!) * 30000) / 1001)));
			assert.deepStrictEqual([...gaps], [15]);
			assert.isAtLeast(kf.length, 6);
		}));

	it.effect('4K is scaled down to 1080p', () =>
		Effect.gen(function* () {
			const t = yield* setup(4, fx.uhd);
			yield* t.run();
			const v = (yield* t.videos.find(t.id))!;
			assert.strictEqual(v.width, 1920);
			assert.strictEqual(v.height, 1080);
		}));

	it.effect('a rotated (portrait phone) clip comes out upright', () =>
		Effect.gen(function* () {
			const t = yield* setup(5, fx.rotated);
			yield* t.run();
			const v = (yield* t.videos.find(t.id))!;
			assert.strictEqual(v.width, 720);
			assert.strictEqual(v.height, 1280);
			const vs = ffprobeJson(toFile(t.mem, keys.processedVideo(t.id), 'rot.mp4'), '-show_streams').streams[0];
			assert.strictEqual(vs.width, 720);
			assert.isUndefined(vs.side_data_list?.find((d: { rotation?: number }) => d.rotation));
		}));

	it.effect('a WebM with no audio track gives an MP4 with video only', () =>
		Effect.gen(function* () {
			const t = yield* setup(6, fx.silent);
			yield* t.run();
			assert.strictEqual((yield* t.videos.find(t.id))!.status, 'ready');
			const streams = ffprobeJson(toFile(t.mem, keys.processedVideo(t.id), 'silent.mp4'), '-show_streams').streams;
			assert.deepStrictEqual(streams.map((s: { codec_name: string }) => s.codec_name), ['h264']);
		}));

	it.effect('too long: fails at once with DURATION_EXCEEDED, no retry, nothing uploaded', () =>
		Effect.gen(function* () {
			const t = yield* setup(7, fx.long);
			assert.deepStrictEqual(yield* t.run(FIRST), { _tag: 'Failed', code: 'DURATION_EXCEEDED' });
			const v = (yield* t.videos.find(t.id))!;
			assert.strictEqual(v.status, 'failed');
			assert.strictEqual(v.errorCode, 'DURATION_EXCEEDED');
			assert.deepStrictEqual([...t.mem.objects.keys()], [t.sourceKey]);
			assert.deepStrictEqual(readdirSync(t.workDir), []);
		}));

	it.effect('a corrupt file is retried (row stays processing) and marked failed only on the last attempt', () =>
		Effect.gen(function* () {
			const t = yield* setup(8, fx.garbage);
			for (let retryCount = 0; retryCount < 3; retryCount++) {
				const exit = yield* Effect.exit(t.run({ retryCount, retryLimit: 3 }));
				assert.isTrue(Exit.isFailure(exit), 'fails so pg-boss retries');
				const v = (yield* t.videos.find(t.id))!;
				assert.strictEqual(v.status, 'processing');
				assert.isNull(v.errorCode);
			}
			const last = yield* Effect.exit(t.run(LAST));
			assert.isTrue(Exit.isFailure(last), 'still fails so pg-boss records the job as failed');
			const v = (yield* t.videos.find(t.id))!;
			assert.strictEqual(v.status, 'failed');
			assert.strictEqual(v.errorCode, 'INVALID_VIDEO');
			assert.deepStrictEqual(t.mem.objects.get(t.sourceKey)!.body, t.source, 'source untouched');
			assert.deepStrictEqual([...t.mem.objects.keys()], [t.sourceKey]);
			assert.deepStrictEqual(readdirSync(t.workDir), []);
		}));

	it.effect('a missing source object is a retryable DOWNLOAD_FAILED', () =>
		Effect.gen(function* () {
			const t = yield* setup(9, fx.basic);
			t.mem.objects.delete(t.sourceKey);
			assert.isTrue(Exit.isFailure(yield* Effect.exit(t.run(FIRST))));
			assert.strictEqual((yield* t.videos.find(t.id))!.status, 'processing');
			yield* Effect.exit(t.run(LAST));
			assert.strictEqual((yield* t.videos.find(t.id))!.errorCode, 'DOWNLOAD_FAILED');
		}));

	it.effect('a video that is not waiting for processing is skipped', () =>
		Effect.gen(function* () {
			const t = yield* setup(10, fx.basic);
			yield* t.videos.markFailed(t.id, 'X');
			assert.deepStrictEqual(yield* t.run(), { _tag: 'Skipped' });
			assert.deepStrictEqual(t.mem.log, []);
		}));

	it.effect('interruption mid-transcode records nothing and still removes the temp dir', () =>
		Effect.gen(function* () {
			const t = yield* setup(11, fx.uhd);
			const fiber = yield* Effect.forkChild(t.run());
			// wait until the transcode has started writing its output
			let jobDir: string | undefined;
			for (let i = 0; i < 400 && !jobDir; i++) {
				const dirs = readdirSync(t.workDir);
				if (dirs.length > 0 && readdirSync(join(t.workDir, dirs[0]!)).includes('video.mp4')) jobDir = join(t.workDir, dirs[0]!);
				// a real timer: it.effect runs on the TestClock, where Effect.sleep never wakes
				else yield* Effect.promise(() => new Promise((r) => setTimeout(r, 10)));
			}
			assert.isDefined(jobDir, 'the transcode started');
			yield* Fiber.interrupt(fiber);
			const exit = yield* Fiber.await(fiber);
			assert.isTrue(Exit.hasInterrupts(exit));
			// no process is still working in the job dir: ffmpeg was killed
			const running = readdirSync('/proc')
				.filter((p) => /^\d+$/.test(p))
				.some((p) => {
					try {
						return readFileSync(`/proc/${p}/cmdline`, 'latin1').includes(jobDir!);
					} catch {
						return false;
					}
				});
			assert.isFalse(running, 'ffmpeg was killed');
			const v = (yield* t.videos.find(t.id))!;
			assert.strictEqual(v.status, 'processing');
			assert.isNull(v.errorCode);
			assert.deepStrictEqual(readdirSync(t.workDir), []);
		}));
});
