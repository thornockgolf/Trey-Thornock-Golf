import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assert, layer } from '@effect/vitest';
import { Analyses, Segments, Users, Videos } from '@ttg/db';
import { TestDb } from '@ttg/db/testing';
import { keys } from '@ttg/shared';
import { Effect, Layer } from 'effect';
import { afterAll, beforeAll } from 'vitest';
import { processSegment } from './process-segment';
import type { Attempt, ProcessConfig } from './process-video';
import { Storage } from './storage';
import { ffprobeJson, makeSegmentFixtures, type SegmentFixtures } from './test-fixtures';

let root: string;
let fx: SegmentFixtures;
beforeAll(() => {
	root = mkdtempSync(join(tmpdir(), 'ttg-segment-test-'));
	fx = makeSegmentFixtures(root);
}, 120_000);
afterAll(() => rmSync(root, { recursive: true, force: true }));

const FIRST: Attempt = { retryCount: 0, retryLimit: 3 };
const LAST: Attempt = { retryCount: 3, retryLimit: 3 };
const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const Live = Layer.mergeAll(Users.layer, Videos.layer, Analyses.layer, Segments.layer).pipe(Layer.provideMerge(TestDb));

/** A coach, an analysis of a 30 s video, and a shared in-memory bucket. */
const setup = (n: number) =>
	Effect.gen(function* () {
		const coach = yield* (yield* Users).ensure({ clerkUserId: `seg_${n}`, role: 'coach' });
		yield* (yield* Videos).create({ id: ID(n), ownerId: coach.id, kind: 'swing', sourceKey: keys.rawSource(ID(n), 'mp4'), sizeBytes: 1 });
		const analysis = yield* (yield* Analyses).create({ videoId: ID(n), coachId: coach.id });
		const segs = yield* Segments;
		const mem = Storage.makeMemory();
		const config: ProcessConfig = { workDir: mkdtempSync(join(root, `work-${n}-`)), threads: 2, transcodeTimeoutMs: 120_000, stepTimeoutMs: 60_000 };
		let next = n * 100;
		/** What the app does: a pending segment plus the browser's upload (the fixture file) and /complete. */
		const upload = (file: string, startMs: number, endMs: number, ext: 'webm' | 'mp4' = 'webm') =>
			Effect.gen(function* () {
				const id = ID(++next);
				const sourceKey = keys.analysisSegmentRaw(analysis.id, id, ext);
				yield* segs.createPending({ id, analysisId: analysis.id, startMs, endMs, sourceKey, annotationsAction: 'keep' });
				mem.objects.set(sourceKey, { body: new Uint8Array(readFileSync(file)), contentType: 'audio/webm' });
				yield* segs.markUploaded(id);
				return { id, sourceKey };
			});
		const run = (id: string, attempt: Attempt = FIRST) => processSegment(id, attempt, config).pipe(Effect.provideService(Storage, mem.service));
		const clip = (id: string) => {
			const o = mem.objects.get(keys.analysisSegment(analysis.id, id));
			assert.isDefined(o, `missing clip for ${id}`);
			const path = join(root, `${id}.mp4`);
			writeFileSync(path, o!.body);
			return path;
		};
		const probe = (path: string) => ffprobeJson(path, '-show_format', '-show_streams');
		return { analysis, segs, mem, upload, run, clip, probe };
	});

const streams = (j: any) => (j.streams as { codec_type: string; codec_name: string; width?: number }[]).map((s) => `${s.codec_type}:${s.codec_name}`);

layer(Live, { timeout: 180_000 })('processSegment', (it) => {
	it.effect('voice-only WebM without a duration becomes AAC in MP4 at exactly the slot length, and goes live', () =>
		Effect.gen(function* () {
			const { analysis, segs, mem, upload, run, clip, probe } = yield* setup(1);
			const rec = yield* upload(fx.voice, 0, 6_000);
			const out = yield* run(rec.id);
			assert.deepStrictEqual(out, { _tag: 'Ready', replaced: 0 });

			const j = probe(clip(rec.id));
			assert.deepStrictEqual(streams(j), ['audio:aac']);
			assert.approximately(Number(j.format.duration) * 1000, 6000, 150);
			assert.include(j.format.format_name, 'mp4');

			const live = yield* segs.listLive(analysis.id);
			assert.deepStrictEqual(live.map((s) => [s.id, s.startMs, s.endMs, s.hasVideo]), [[rec.id, 0, 6_000, false]]);
			assert.strictEqual(live[0]!.clipKey, keys.analysisSegment(analysis.id, rec.id));
			// the raw recording is kept
			assert.isTrue(mem.objects.has(rec.sourceKey));
			assert.deepStrictEqual(mem.log.filter((l) => l.op === 'delete'), []);
		})
	);

	it.effect('a camera recording becomes H.264 + AAC, at most 1280 wide', () =>
		Effect.gen(function* () {
			const { upload, run, clip, probe, segs, analysis } = yield* setup(2);
			const rec = yield* upload(fx.camera, 0, 6_000);
			assert.strictEqual((yield* run(rec.id))._tag, 'Ready');
			const j = probe(clip(rec.id));
			assert.deepStrictEqual(streams(j), ['video:h264', 'audio:aac']);
			assert.isAtMost(j.streams[0].width, 1280);
			assert.approximately(Number(j.format.duration) * 1000, 6000, 250);
			assert.isTrue((yield* segs.listLive(analysis.id))[0]!.hasVideo);
		})
	);

	it.effect('Safari-style AAC in MP4 is accepted', () =>
		Effect.gen(function* () {
			const { upload, run, clip, probe } = yield* setup(3);
			const rec = yield* upload(fx.voiceMp4, 0, 6_000, 'mp4');
			assert.strictEqual((yield* run(rec.id))._tag, 'Ready');
			assert.approximately(Number(probe(clip(rec.id)).format.duration) * 1000, 6000, 150);
		})
	);

	it.effect('a recording a little short of its slot is padded to the slot length; a long one is cut', () =>
		Effect.gen(function* () {
			const { upload, run, clip, probe } = yield* setup(4);
			const short = yield* upload(fx.voice4, 0, 5_000); // 4 s into a 5 s slot
			assert.strictEqual((yield* run(short.id))._tag, 'Ready');
			assert.approximately(Number(probe(clip(short.id)).format.duration) * 1000, 5000, 150);
			const long = yield* upload(fx.voice, 5_000, 9_000); // 6 s into a 4 s slot
			assert.strictEqual((yield* run(long.id))._tag, 'Ready');
			assert.approximately(Number(probe(clip(long.id)).format.duration) * 1000, 4000, 150);
		})
	);

	it.effect('a recording far shorter than its slot fails at once (SEGMENT_TOO_SHORT) and the live analysis is untouched', () =>
		Effect.gen(function* () {
			const { analysis, segs, upload, run } = yield* setup(5);
			const first = yield* upload(fx.voice, 0, 6_000);
			yield* run(first.id);
			const bad = yield* upload(fx.voice1, 2_000, 6_000); // 1 s for a 4 s slot
			const out = yield* run(bad.id);
			assert.deepStrictEqual(out, { _tag: 'Failed', code: 'SEGMENT_TOO_SHORT' });
			const row = yield* segs.find(bad.id);
			assert.strictEqual(row?.status, 'failed');
			assert.strictEqual(row?.errorCode, 'SEGMENT_TOO_SHORT');
			assert.deepStrictEqual((yield* segs.listLive(analysis.id)).map((s) => s.id), [first.id]);
		})
	);

	it.effect('re-recording the middle: the outside parts keep their R2 object (byte for byte), and the new clip fills the gap', () =>
		Effect.gen(function* () {
			const { analysis, segs, mem, upload, run } = yield* setup(6);
			const take = yield* upload(fx.voice, 0, 6_000);
			yield* run(take.id);
			const takeKey = keys.analysisSegment(analysis.id, take.id);
			const before = new Uint8Array(mem.objects.get(takeKey)!.body);
			mem.log.length = 0;

			const mid = yield* upload(fx.voice2, 2_000, 4_000);
			const out = yield* run(mid.id);
			assert.deepStrictEqual(out, { _tag: 'Ready', replaced: 1 });

			const live = yield* segs.listLive(analysis.id);
			assert.deepStrictEqual(live.map((s) => [s.startMs, s.endMs, s.clipStartMs]), [[0, 2_000, 0], [2_000, 4_000, 0], [4_000, 6_000, 4_000]]);
			assert.strictEqual(live[0]!.clipKey, takeKey);
			assert.strictEqual(live[2]!.clipKey, takeKey);
			// the original clip was not rewritten or deleted
			assert.deepStrictEqual(mem.objects.get(takeKey)!.body, before);
			assert.deepStrictEqual(mem.log.filter((l) => l.key === takeKey), []);
			assert.deepStrictEqual(mem.log.filter((l) => l.op === 'delete'), []);
		})
	);

	it.effect('a corrupt file is retried and marked failed only on the last attempt; the previous segment stays live', () =>
		Effect.gen(function* () {
			const { analysis, segs, upload, run } = yield* setup(7);
			const first = yield* upload(fx.voice, 0, 6_000);
			yield* run(first.id);
			const bad = yield* upload(fx.garbage, 0, 6_000);
			const early = yield* Effect.exit(run(bad.id, FIRST));
			assert.strictEqual(early._tag, 'Failure');
			assert.strictEqual((yield* segs.find(bad.id))?.status, 'processing'); // not failed yet: pg-boss will retry
			const last = yield* Effect.exit(run(bad.id, LAST));
			assert.strictEqual(last._tag, 'Failure');
			const row = yield* segs.find(bad.id);
			assert.strictEqual(row?.status, 'failed');
			assert.strictEqual(row?.errorCode, 'INVALID_RECORDING');
			assert.deepStrictEqual((yield* segs.listLive(analysis.id)).map((s) => s.id), [first.id]);
		})
	);

	it.effect('running it again for a segment that is already live does nothing', () =>
		Effect.gen(function* () {
			const { mem, upload, run } = yield* setup(8);
			const rec = yield* upload(fx.voice, 0, 6_000);
			assert.strictEqual((yield* run(rec.id))._tag, 'Ready');
			mem.log.length = 0;
			assert.deepStrictEqual(yield* run(rec.id), { _tag: 'Skipped' });
			assert.deepStrictEqual(mem.log, []);
		})
	);

	it.effect('a missing recording object is retried (DOWNLOAD_FAILED), not treated as a bad file', () =>
		Effect.gen(function* () {
			const { mem, segs, upload, run } = yield* setup(9);
			const rec = yield* upload(fx.voice, 0, 6_000);
			mem.objects.delete(rec.sourceKey);
			assert.strictEqual((yield* Effect.exit(run(rec.id, LAST)))._tag, 'Failure');
			assert.strictEqual((yield* segs.find(rec.id))?.errorCode, 'DOWNLOAD_FAILED');
		})
	);
});
