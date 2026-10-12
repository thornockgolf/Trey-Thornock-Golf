import { Analyses, Annotations, Db, Queue, Segments, Users, Videos } from '@ttg/db';
import { TestDb } from '@ttg/db/testing';
import { MAX_SEGMENT_BYTES, MAX_SEGMENT_MS, keys } from '@ttg/shared';
import { Effect, Layer, ManagedRuntime } from 'effect';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createAnalysis } from './analyses';
import { CoachAllowlist } from './auth';
import { makeFakeR2 } from './r2-fake';
import { makeRunRoute } from './run-route';
import { completeSegment, createSegment, getManifest, getSegment, listSegments, undoSegments } from './segments';
import { fakeEvent } from './test-utils';

// Integration: real Users/Videos/Analyses/Segments on a throwaway database, in-memory R2 and queue. The worker's
// part (processing and committing a recording) is played by calling the Segments service directly.
const r2 = makeFakeR2();
const sent: { name: string; payload: any }[] = [];
const FakeQueue = Layer.succeed(Queue, Queue.of({ send: (name, payload) => Effect.sync(() => (sent.push({ name, payload }), 'job-1')), work: () => Effect.void }));
const Services = Layer.mergeAll(Users.layer, Videos.layer, Analyses.layer, Annotations.layer, Segments.layer).pipe(Layer.provideMerge(TestDb));
const rt = ManagedRuntime.make(Layer.mergeAll(CoachAllowlist.layerFromCsv('coach_a,coach_b'), r2.layer, FakeQueue).pipe(Layer.provideMerge(Services)));
const run = makeRunRoute(rt);
afterAll(() => rt.dispose());
beforeEach(() => void (sent.length = 0));

const call = async (effect: Effect.Effect<any, any, any>, event: ReturnType<typeof fakeEvent>) => {
	const res = await run(event, effect as never);
	return { status: res.status, body: (await res.json()) as any };
};
const ev = (userId: string | null, params: Record<string, string> = {}, body?: unknown, query = '') => fakeEvent({ userId, body, params, query });
const V = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const DURATION = 30_000;
const video = (ownerClerk: string, id: string, ready = true) =>
	rt.runPromise(
		Effect.gen(function* () {
			const owner = yield* (yield* Users).ensure({ clerkUserId: ownerClerk, role: 'player' });
			const videos = yield* Videos;
			yield* videos.create({ id, ownerId: owner.id, kind: 'swing', sourceKey: keys.rawSource(id, 'mp4'), sizeBytes: 10 });
			if (!ready) return;
			yield* videos.markUploaded(id, 10);
			yield* videos.claimForProcessing(id);
			yield* videos.markReady(id, { processedKey: keys.processedVideo(id), thumbnailKey: keys.poster(id), spriteKey: keys.sprite(id), durationMs: DURATION, fps: 30, width: 1280, height: 720 });
		})
	);
const assign = (coachClerk: string, playerClerk: string) =>
	rt.runPromise(
		Effect.gen(function* () {
			const users = yield* Users;
			const c = yield* users.ensure({ clerkUserId: coachClerk, role: 'coach' });
			const p = yield* users.ensure({ clerkUserId: playerClerk, role: 'player' });
			yield* (yield* Db).query(`insert into coach_assignments (coach_id, player_id, status) values ($1, $2, 'active') on conflict do nothing`, [c.id, p.id]);
		})
	);
/** A player's ready video, assigned to coach_a, with an analysis. Returns the analysis id. */
const setup = async (n: number, player: string, ready = true) => {
	await video(player, V(n), ready);
	await assign('coach_a', player);
	return (await call(createAnalysis, ev('coach_a', {}, { videoId: V(n) }))).body.id as string;
};

const record = (aid: string, startMs: number, endMs: number, extra: Record<string, unknown> = {}) =>
	call(createSegment, ev('coach_a', { id: aid }, { startMs, endMs, contentType: 'audio/webm', sizeBytes: 5_000, ...extra }));

/** Upload + complete + "worker commits it" (the worker's job). */
const goLive = async (aid: string, startMs: number, endMs: number, extra: Record<string, unknown> = {}) => {
	const made = await record(aid, startMs, endMs, extra);
	expect(made.status).toBe(200);
	const sid = made.body.segment.id as string;
	r2.objects.set(keys.analysisSegmentRaw(aid, sid, 'webm'), { sizeBytes: 5_000, contentType: 'audio/webm' });
	expect((await call(completeSegment, ev('coach_a', { id: aid, segmentId: sid }))).status).toBe(200);
	await rt.runPromise(
		Effect.gen(function* () {
			const s = yield* Segments;
			yield* s.claimForProcessing(sid);
			yield* s.commit(sid, { clipKey: keys.analysisSegment(aid, sid), hasVideo: false });
		})
	);
	return sid;
};
const manifest = (user: string | null, aid: string) => call(getManifest, ev(user, { id: aid }));

beforeEach(() => r2.objects.clear());

describe('access', () => {
	it('only a coach who may see the video can record; the owner can only read the manifest', async () => {
		const aid = await setup(1, 'pl_a');
		const body = { startMs: 0, endMs: 5_000, contentType: 'audio/webm', sizeBytes: 100 };
		expect((await call(createSegment, ev('coach_a', { id: aid }, body))).status).toBe(200);
		expect((await call(createSegment, ev('pl_a', { id: aid }, body))).status).toBe(403);
		expect((await call(createSegment, ev('pl_b', { id: aid }, body))).status).toBe(403);
		expect((await call(createSegment, ev('coach_b', { id: aid }, body))).status).toBe(403);
		expect((await call(createSegment, ev(null, { id: aid }, body))).status).toBe(401);
		expect((await call(listSegments, ev('pl_a', { id: aid }))).status).toBe(403);
		expect((await call(undoSegments, ev('pl_a', { id: aid }))).status).toBe(403);

		expect((await manifest('pl_a', aid)).status).toBe(200);
		expect((await manifest('coach_a', aid)).status).toBe(200);
		expect((await manifest('pl_b', aid)).status).toBe(403);
		expect((await manifest('coach_b', aid)).status).toBe(403);
		expect((await manifest(null, aid)).status).toBe(401);
		expect((await manifest('pl_a', V(900))).status).toBe(404);
	});

	it('a segment id from another analysis is 404', async () => {
		const a1 = await setup(2, 'pl_a2');
		const a2 = await setup(3, 'pl_a3');
		const sid = (await record(a1, 0, 5_000)).body.segment.id;
		expect((await call(getSegment, ev('coach_a', { id: a2, segmentId: sid }))).status).toBe(404);
		expect((await call(completeSegment, ev('coach_a', { id: a2, segmentId: sid }))).status).toBe(404);
		expect((await call(getSegment, ev('coach_a', { id: a1, segmentId: sid }))).status).toBe(200);
	});
});

let uniq = 0;
describe('POST /segments validation', () => {
	it.each([
		['end before start', { startMs: 5_000, endMs: 1_000 }],
		['shorter than the minimum', { startMs: 1_000, endMs: 1_100 }],
		['longer than the maximum', { startMs: 0, endMs: MAX_SEGMENT_MS + 1_000 }],
		['past the end of the video', { startMs: 25_000, endMs: DURATION + 1 }],
		['an image', { contentType: 'image/png' }],
		['over the size cap', { sizeBytes: MAX_SEGMENT_BYTES + 1 }],
		['fractional ms', { startMs: 0.5 }],
		['an unknown annotations choice', { annotations: 'delete' }]
	])('422 for %s', async (_n, patch) => {
		const aid = await setup(500 + ++uniq, `pl_v${uniq}`);
		const r = await record(aid, 0, 5_000, patch);
		expect(r.status).toBe(422);
	});

	it('409 while the video is still processing', async () => {
		const aid = await setup(11, 'pl_np', false);
		expect((await record(aid, 0, 5_000)).status).toBe(409);
	});

	it('creates a pending segment and a presigned PUT; nothing is live yet', async () => {
		const aid = await setup(12, 'pl_ok');
		const r = await record(aid, 2_000, 9_000);
		expect(r.body.segment).toMatchObject({ startMs: 2_000, endMs: 9_000, status: 'pending' });
		expect(r.body.upload.url).toContain(`analysis/${aid}/${r.body.segment.id}.raw.webm`);
		expect(r.body.upload.headers).toEqual({ 'Content-Type': 'audio/webm' });
		expect((await manifest('coach_a', aid)).body.segments).toEqual([]);
		expect((await call(listSegments, ev('coach_a', { id: aid }))).body.segments).toEqual([]);
	});
});

describe('complete', () => {
	it('409 until the recording is in R2; then uploaded and queued once, even if repeated', async () => {
		const aid = await setup(20, 'pl_c');
		const sid = (await record(aid, 0, 5_000)).body.segment.id;
		const params = { id: aid, segmentId: sid };
		expect((await call(completeSegment, ev('coach_a', params))).status).toBe(409);
		expect(sent).toEqual([]);

		r2.objects.set(keys.analysisSegmentRaw(aid, sid, 'webm'), { sizeBytes: 5_000, contentType: 'audio/webm' });
		const done = await call(completeSegment, ev('coach_a', params));
		expect(done.body.status).toBe('uploaded');
		expect(sent).toEqual([{ name: 'analysis.segment.uploaded', payload: { analysis_id: aid, segment_id: sid } }]);
		// still not live: the worker has not processed it
		expect((await manifest('coach_a', aid)).body.segments).toEqual([]);
	});

	it('an empty or oversize object is refused', async () => {
		const aid = await setup(21, 'pl_c2');
		const sid = (await record(aid, 0, 5_000)).body.segment.id;
		r2.objects.set(keys.analysisSegmentRaw(aid, sid, 'webm'), { sizeBytes: 0, contentType: 'audio/webm' });
		expect((await call(completeSegment, ev('coach_a', { id: aid, segmentId: sid }))).status).toBe(409);
		r2.objects.set(keys.analysisSegmentRaw(aid, sid, 'webm'), { sizeBytes: MAX_SEGMENT_BYTES + 1, contentType: 'audio/webm' });
		expect((await call(completeSegment, ev('coach_a', { id: aid, segmentId: sid }))).status).toBe(409);
	});
});

describe('manifest and re-record', () => {
	it('lists live segments in time order with signed clip URLs', async () => {
		const aid = await setup(30, 'pl_m');
		const late = await goLive(aid, 15_000, 30_000);
		const early = await goLive(aid, 0, 10_000);
		const m = await manifest('pl_m', aid);
		expect(m.body.videoId).toBe(V(30));
		expect(m.body.segments.map((s: any) => [s.startMs, s.endMs, s.clipStartMs, s.hasVideo])).toEqual([[0, 10_000, 0, false], [15_000, 30_000, 0, false]]);
		expect(m.body.segments[0].id).toBe(early);
		expect(m.body.segments[1].url).toContain(keys.analysisSegment(aid, late));
		expect(m.body.segments.every((s: any) => s.url.startsWith('http'))).toBe(true);
		expect(JSON.stringify(m.body)).not.toContain('.raw.');
	});

	it('re-recording the middle: outside parts keep their clip, the middle is the new one, nothing else changes', async () => {
		const aid = await setup(31, 'pl_r');
		const take = await goLive(aid, 0, 30_000);
		const mid = await goLive(aid, 10_000, 15_000);
		const m = (await manifest('pl_r', aid)).body.segments;
		expect(m.map((s: any) => [s.startMs, s.endMs, s.clipStartMs])).toEqual([[0, 10_000, 0], [10_000, 15_000, 0], [15_000, 30_000, 15_000]]);
		expect(m[0].url).toContain(keys.analysisSegment(aid, take));
		expect(m[2].url).toContain(keys.analysisSegment(aid, take));
		expect(m[1].url).toContain(keys.analysisSegment(aid, mid));
		// the earlier recording's file was never touched
		expect(r2.objects.has(keys.analysisSegmentRaw(aid, take, 'webm'))).toBe(true);
	});

	it('a failed new recording leaves the analysis as it was', async () => {
		const aid = await setup(32, 'pl_f');
		await goLive(aid, 0, 30_000);
		const sid = (await record(aid, 10_000, 15_000)).body.segment.id;
		await rt.runPromise(Effect.flatMap(Segments, (s) => s.markFailed(sid, 'TRANSCODE_FAILED')));
		const m = (await manifest('pl_f', aid)).body.segments;
		expect(m.map((s: any) => [s.startMs, s.endMs])).toEqual([[0, 30_000]]);
		expect((await call(getSegment, ev('coach_a', { id: aid, segmentId: sid }))).body).toMatchObject({ status: 'failed', errorCode: 'TRANSCODE_FAILED' });
	});

	it('says how many annotations start inside the range, and rejects a malformed range', async () => {
		const aid = await setup(33, 'pl_an');
		await rt.runPromise(
			Effect.gen(function* () {
				const coach = yield* (yield* Users).ensure({ clerkUserId: 'coach_a', role: 'coach' });
				const ann = yield* Annotations;
				const shape = { v: 1, type: 'arrow', color: '#D4A017', width: 0.005, a: { x: 0, y: 0 }, b: { x: 1, y: 1 } } as const;
				for (const ms of [3_000, 12_000, 22_000]) yield* ann.create({ videoId: V(33), authorId: coach.id, startMs: ms, endMs: ms + 500, shape });
			})
		);
		const r = await call(listSegments, ev('coach_a', { id: aid }, undefined, '?startMs=10000&endMs=15000'));
		expect(r.body.annotationsInRange).toBe(1);
		expect((await call(listSegments, ev('coach_a', { id: aid }))).body.annotationsInRange).toBeNull();
		expect((await call(listSegments, ev('coach_a', { id: aid }, undefined, '?startMs=5&endMs=1'))).status).toBe(422);
		expect((await call(listSegments, ev('coach_a', { id: aid }, undefined, '?startMs=a&endMs=1'))).status).toBe(422);
	});
});

describe('undo', () => {
	it('reverses the latest re-record, then runs out; players cannot', async () => {
		const aid = await setup(40, 'pl_u');
		await goLive(aid, 0, 30_000);
		await goLive(aid, 10_000, 15_000);
		expect((await manifest('pl_u', aid)).body.segments).toHaveLength(3);

		const undone = await call(undoSegments, ev('coach_a', { id: aid }));
		expect(undone.status).toBe(200);
		expect(undone.body.restored).toBe(1);
		expect((await manifest('pl_u', aid)).body.segments.map((s: any) => [s.startMs, s.endMs])).toEqual([[0, 30_000]]);

		expect((await call(undoSegments, ev('coach_a', { id: aid }))).status).toBe(200); // undoes the first recording
		const none = await call(undoSegments, ev('coach_a', { id: aid }));
		expect(none.status).toBe(409);
		expect(none.body.message).toMatch(/nothing to undo/i);
	});

	it('409 when the change is older than 30 days', async () => {
		const aid = await setup(41, 'pl_ue');
		const take = await goLive(aid, 0, 30_000);
		await rt.runPromise(Effect.flatMap(Db, (db) => db.query(`update analysis_segments set committed_at = now() - interval '31 days' where id = $1`, [take])));
		const r = await call(undoSegments, ev('coach_a', { id: aid }));
		expect(r.status).toBe(409);
		expect(r.body.message).toMatch(/too old/i);
	});

	it('removing annotations on re-record, then undoing, brings them back', async () => {
		const aid = await setup(42, 'pl_ua');
		await rt.runPromise(
			Effect.gen(function* () {
				const coach = yield* (yield* Users).ensure({ clerkUserId: 'coach_a', role: 'coach' });
				yield* (yield* Annotations).create({ videoId: V(42), authorId: coach.id, startMs: 12_000, endMs: 12_500, shape: { v: 1, type: 'arrow', color: '#D4A017', width: 0.005, a: { x: 0, y: 0 }, b: { x: 1, y: 1 } } });
			})
		);
		await goLive(aid, 0, 30_000);
		const count = () => rt.runPromise(Effect.flatMap(Annotations, (a) => a.listByVideo(V(42)))).then((r) => r.length);
		await goLive(aid, 10_000, 15_000, { annotations: 'remove' });
		expect(await count()).toBe(0);
		await call(undoSegments, ev('coach_a', { id: aid }));
		expect(await count()).toBe(1);
	});
});
