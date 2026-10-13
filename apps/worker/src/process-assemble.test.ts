import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assert, layer } from '@effect/vitest';
import { AnalysisExports, Analyses, Annotations, Db, Segments, Users, Videos } from '@ttg/db';
import { TestDb } from '@ttg/db/testing';
import { keys, type AnnotationShape } from '@ttg/shared';
import { Effect, Layer } from 'effect';
import sharp from 'sharp';
import { afterAll, beforeAll } from 'vitest';
import { processAssemble } from './process-assemble';
import type { Attempt, ProcessConfig } from './process-video';
import { Storage } from './storage';
import { ffprobeJson } from './test-fixtures';

// Integration: real ffmpeg, sharp and database; in-memory R2. The video is flat grey with a silent track, so anything
// seen or heard in the export came from the annotations and the commentary clips.
const sh = (cmd: string, args: string[]) => {
	const r = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
	if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} failed: ${r.stderr}`);
	return r.stderr + r.stdout;
};
const ffmpeg = (...args: string[]) => sh('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args]);

let root: string;
let videoFile: string;
let tone: string; // 4 s of 1 kHz at a steady level, AAC in MP4
let toneWithPicture: string;
let silentClip: string;
beforeAll(() => {
	root = mkdtempSync(join(tmpdir(), 'ttg-assemble-test-'));
	videoFile = join(root, 'video.mp4');
	ffmpeg('-f', 'lavfi', '-i', 'color=c=0x404040:size=640x360:rate=30:duration=6', '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo', '-t', '6', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', videoFile);
	tone = join(root, 'tone.mp4');
	ffmpeg('-f', 'lavfi', '-i', 'sine=frequency=1000:duration=4', '-af', 'volume=0.5', '-c:a', 'aac', tone);
	toneWithPicture = join(root, 'tone-video.mp4');
	ffmpeg('-f', 'lavfi', '-i', 'color=c=red:size=320x180:rate=30:duration=4', '-f', 'lavfi', '-i', 'sine=frequency=1000:duration=4', '-af', 'volume=0.5', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', toneWithPicture);
	silentClip = join(root, 'silent-clip.mp4');
	ffmpeg('-f', 'lavfi', '-i', 'color=c=blue:size=320x180:rate=30:duration=4', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', silentClip);
}, 120_000);
afterAll(() => rmSync(root, { recursive: true, force: true }));

const FIRST: Attempt = { retryCount: 0, retryLimit: 3 };
const LAST: Attempt = { retryCount: 3, retryLimit: 3 };
const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const Live = Layer.mergeAll(Users.layer, Videos.layer, Analyses.layer, Annotations.layer, Segments.layer, AnalysisExports.layer).pipe(Layer.provideMerge(TestDb));
const read = (path: string) => new Uint8Array(readFileSync(path));

const line = (x: number, color: AnnotationShape['color'] = '#D4A017'): AnnotationShape => ({ v: 1, type: 'line', color, width: 0.02, a: { x, y: 0.1 }, b: { x, y: 0.9 } });

const setup = (n: number, opts: { processed?: boolean } = {}) =>
	Effect.gen(function* () {
		const db = yield* Db;
		const coach = yield* (yield* Users).ensure({ clerkUserId: `asm_${n}`, role: 'coach' });
		yield* (yield* Videos).create({ id: ID(n), ownerId: coach.id, kind: 'swing', sourceKey: keys.rawSource(ID(n), 'mp4'), sizeBytes: 1 });
		const analysis = yield* (yield* Analyses).create({ videoId: ID(n), coachId: coach.id });
		const mem = Storage.makeMemory();
		if (opts.processed !== false) {
			yield* db.query(`update videos set processed_key = $2, duration_ms = 6000, width = 640, height = 360 where id = $1`, [ID(n), keys.processedVideo(ID(n))]);
			mem.objects.set(keys.processedVideo(ID(n)), { body: read(videoFile), contentType: 'video/mp4' });
		}
		const config: ProcessConfig = { workDir: mkdtempSync(join(root, `work-${n}-`)), threads: 2, transcodeTimeoutMs: 120_000, stepTimeoutMs: 60_000 };
		let next = n * 100;
		/** A live commentary segment: the clip is in the bucket and the row is ready, as after `analysis.segment.uploaded`. */
		const segment = (file: string, startMs: number, endMs: number, clipStartMs = 0, hasVideo = false) =>
			Effect.gen(function* () {
				const id = ID(++next);
				const clipKey = keys.analysisSegment(analysis.id, id);
				yield* (yield* Segments).createPending({ id, analysisId: analysis.id, startMs, endMs, sourceKey: keys.analysisSegmentRaw(analysis.id, id, 'mp4'), annotationsAction: 'keep' });
				yield* db.query(`update analysis_segments set status = 'ready', clip_key = $2, clip_start_ms = $3, has_video = $4, committed_at = now() where id = $1`, [id, clipKey, clipStartMs, hasVideo]);
				mem.objects.set(clipKey, { body: read(file), contentType: 'audio/mp4' });
			});
		const annotate = (startMs: number, endMs: number, shape: AnnotationShape) => Annotations.use((a) => a.create({ videoId: ID(n), authorId: coach.id, startMs, endMs, shape }));
		const request = AnalysisExports.use((e) => e.request(analysis.id));
		const run = (attempt: Attempt = FIRST) => processAssemble(analysis.id, attempt, config).pipe(Effect.provideService(Storage, mem.service));
		const exported = () => {
			const o = mem.objects.get(keys.analysisExport(analysis.id));
			assert.isDefined(o, 'no export uploaded');
			const path = join(root, `export-${n}.mp4`);
			writeFileSync(path, o!.body);
			return path;
		};
		return { analysis, mem, segment, annotate, request, run, exported, db };
	});

/** Loudness (dB) of a stretch of the export's audio. -91 or less is silence. */
const loudness = (file: string, fromS: number, lenS: number) => {
	const out = sh('ffmpeg', ['-hide_banner', '-nostats', '-ss', String(fromS), '-t', String(lenS), '-i', file, '-vn', '-af', 'volumedetect', '-f', 'null', '-']);
	const m = /mean_volume: (-?[\d.]+|-inf) dB/.exec(out);
	return m ? (m[1] === '-inf' ? -200 : Number(m[1])) : -200;
};
/** The picture at `atS` as an RGB reader. */
const frame = async (file: string, atS: number, name: string) => {
	const png = join(root, `${name}.png`);
	ffmpeg('-ss', String(atS), '-i', file, '-frames:v', '1', png);
	const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
	return { width: info.width, height: info.height, at: (x: number, y: number) => [...data.subarray((y * info.width + x) * 3, (y * info.width + x) * 3 + 3)] };
};
const near = (rgb: number[], want: number[], tol = 30) => rgb.every((c, i) => Math.abs(c - want[i]!) <= tol);
const GREY = [0x40, 0x40, 0x40];
const GOLD = [0xd4, 0xa0, 0x17];

layer(Live, { timeout: 240_000 })('processAssemble', (it) => {
	it.effect('mixes each commentary clip at its exact millisecond slot and draws the annotations for exactly their time', () =>
		Effect.gen(function* () {
			const { analysis, mem, segment, annotate, request, run, exported } = yield* setup(1);
			// 1.5 s-3.5 s from the start of one clip; 4.25 s-5 s from 2 s into another (a trimmed piece of a longer take)
			yield* segment(tone, 1_500, 3_500);
			yield* segment(tone, 4_250, 5_000, 2_000);
			yield* annotate(1_000, 2_000, line(0.5));
			yield* annotate(3_000, 3_000, line(0.25, '#FFFFFF')); // a one-frame note
			yield* request;

			const out = yield* run();
			assert.deepInclude(out, { _tag: 'Ready', clips: 2, overlayFrames: true });

			const file = exported();
			const j = ffprobeJson(file, '-show_format', '-show_streams') as any;
			assert.deepStrictEqual(j.streams.map((s: any) => s.codec_name), ['h264', 'aac']);
			assert.approximately(Number(j.format.duration) * 1000, 6000, 100);
			assert.strictEqual(j.streams[0].width, 640);

			// commentary: silence, speech 1.5-3.5, silence, speech 4.25-5, silence
			assert.isBelow(loudness(file, 0, 1.3), -60);
			assert.isAbove(loudness(file, 1.7, 1.6), -40);
			assert.isBelow(loudness(file, 3.7, 0.45), -60);
			assert.isAbove(loudness(file, 4.35, 0.6), -40);
			assert.isBelow(loudness(file, 5.2, 0.7), -60);
			// mixed at the level the player hears, not normalized down
			assert.approximately(loudness(file, 1.7, 1.6), loudness(tone, 0.2, 1.6), 1.5);
			// the slot edges are exact: nothing just before the start, speech just after it
			assert.isBelow(loudness(file, 1.3, 0.18), -60);
			assert.isAbove(loudness(file, 1.52, 0.18), -40);

			// annotations: grey frame, then a gold line at x = 320 for 1.0-2.0 s, then grey again
			const x = 320;
			const y = 180;
			assert.isTrue(near((yield* Effect.promise(() => frame(file, 0.5, 'a1'))).at(x, y), GREY));
			assert.isTrue(near((yield* Effect.promise(() => frame(file, 1.5, 'a2'))).at(x, y), GOLD), 'gold line at 1.5 s');
			assert.isTrue(near((yield* Effect.promise(() => frame(file, 2.5, 'a3'))).at(x, y), GREY));
			const note = yield* Effect.promise(() => frame(file, 3.0, 'a4'));
			assert.isTrue(near(note.at(160, y), [0xff, 0xff, 0xff], 40), 'white one-frame note at 3.0 s');
			assert.isTrue(near((yield* Effect.promise(() => frame(file, 3.3, 'a5'))).at(160, y), GREY));

			// the export is recorded, and the analysis' own files are untouched
			const rec = (yield* AnalysisExports.use((e) => e.find(analysis.id)))!;
			assert.deepInclude(rec, { status: 'ready', outputKey: keys.analysisExport(analysis.id), errorCode: null });
			assert.strictEqual(rec.sizeBytes, mem.objects.get(keys.analysisExport(analysis.id))!.body.length);
			assert.deepStrictEqual(mem.log.filter((l) => l.op === 'delete'), []);
			assert.strictEqual(mem.log.filter((l) => l.op === 'upload').length, 1);
		})
	);

	it.effect('plays a camera clip\'s voice only, skips a clip with no sound, and makes a plain re-encode when nothing is drawn', () =>
		Effect.gen(function* () {
			const { segment, request, run, exported } = yield* setup(2);
			yield* segment(toneWithPicture, 0, 2_000, 0, true);
			yield* segment(silentClip, 3_000, 5_000);
			yield* request;
			const out = yield* run();
			assert.deepInclude(out, { _tag: 'Ready', clips: 1, overlayFrames: false });
			const file = exported();
			assert.isAbove(loudness(file, 0.2, 1.6), -40);
			assert.isBelow(loudness(file, 3.2, 1.6), -60);
			const f = yield* Effect.promise(() => frame(file, 1, 'b1')); // the coach's red camera picture is not in the export
			assert.isTrue(near(f.at(320, 180), GREY));
		})
	);

	it.effect('exports an analysis with no commentary and no annotations as the video itself', () =>
		Effect.gen(function* () {
			const { request, run, exported } = yield* setup(3);
			yield* request;
			assert.deepInclude(yield* run(), { _tag: 'Ready', clips: 0, overlayFrames: false });
			assert.approximately(Number(ffprobeJson(exported(), '-show_format').format.duration), 6, 0.2);
		})
	);

	it.effect('is a no-op without a request or once finished, and a final failure (video gone) is recorded without retries', () =>
		Effect.gen(function* () {
			const none = yield* setup(4);
			assert.deepStrictEqual(yield* none.run(), { _tag: 'Skipped' });

			const done = yield* setup(5);
			yield* done.request;
			yield* done.run();
			assert.deepStrictEqual(yield* done.run(), { _tag: 'Skipped' });
			assert.strictEqual(done.mem.log.filter((l) => l.op === 'upload').length, 1);

			const gone = yield* setup(6, { processed: false });
			yield* gone.request;
			assert.deepStrictEqual(yield* gone.run(), { _tag: 'Failed', code: 'SOURCE_MISSING' });
			assert.deepInclude((yield* AnalysisExports.use((e) => e.find(gone.analysis.id)))!, { status: 'failed', errorCode: 'SOURCE_MISSING' });
		})
	);

	it.effect('a missing clip is retried (the export stays queued), and recorded as failed only on the last attempt', () =>
		Effect.gen(function* () {
			const { analysis, mem, segment, request, run } = yield* setup(7);
			yield* segment(tone, 1_000, 3_000);
			mem.objects.delete(keys.analysisSegment(analysis.id, ID(701)));
			yield* request;
			const first = yield* Effect.exit(run(FIRST));
			assert.strictEqual(first._tag, 'Failure'); // handed back to pg-boss
			assert.strictEqual((yield* AnalysisExports.use((e) => e.find(analysis.id)))!.status, 'processing');
			const last = yield* Effect.exit(run(LAST));
			assert.strictEqual(last._tag, 'Failure');
			assert.deepInclude((yield* AnalysisExports.use((e) => e.find(analysis.id)))!, { status: 'failed', errorCode: 'DOWNLOAD_FAILED' });
			// the coach can ask again afterwards
			assert.isTrue((yield* request).started);
		})
	);
});
