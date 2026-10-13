import { AnalysisExports, Analyses, Annotations, Db, Queue, QueueError, Segments, Users, Videos } from '@ttg/db';
import { TestDb } from '@ttg/db/testing';
import { keys, type AnnotationShape } from '@ttg/shared';
import { Effect, Layer, ManagedRuntime } from 'effect';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createAnalysis } from './analyses';
import { getExport, requestExport } from './analysis-export';
import { CoachAllowlist } from './auth';
import { makeFakeR2 } from './r2-fake';
import { makeRunRoute } from './run-route';
import { fakeEvent } from './test-utils';

// Integration: the export endpoints on a real database, with an in-memory R2 and queue. The worker's part is in
// apps/worker (process-assemble.test.ts); here it is played by calling AnalysisExports directly.
const r2 = makeFakeR2();
const { layer: MemoryQueue, sent } = Queue.layerMemory();
let queueDown = false;
const FlakyQueue = Layer.effect(
	Queue,
	Effect.gen(function* () {
		const inner = yield* Effect.service(Queue);
		return Queue.of({ ...inner, send: (...args) => (queueDown ? Effect.fail(new QueueError({ message: 'down' })) : inner.send(...args)) });
	})
).pipe(Layer.provide(MemoryQueue));
const Services = Layer.mergeAll(Users.layer, Videos.layer, Analyses.layer, Annotations.layer, Segments.layer, AnalysisExports.layer).pipe(Layer.provideMerge(TestDb));
const rt = ManagedRuntime.make(Layer.mergeAll(CoachAllowlist.layerFromCsv('coach_a,coach_b'), r2.layer, FlakyQueue).pipe(Layer.provideMerge(Services)));
const run = makeRunRoute(rt);
afterAll(() => rt.dispose());
beforeEach(() => {
	sent.length = 0;
	queueDown = false;
});

const call = async (effect: Effect.Effect<any, any, any>, userId: string | null, params: Record<string, string> = {}, body?: unknown) => {
	const res = await run(fakeEvent({ userId, params, body }), effect as never);
	return { status: res.status, body: (await res.json()) as any };
};
const V = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const arrow: AnnotationShape = { v: 1, type: 'arrow', color: '#D4A017', width: 0.005, a: { x: 0.1, y: 0.2 }, b: { x: 0.8, y: 0.9 } };

/** A player's video assigned to coach_a with an analysis; optionally something to export. */
const setup = (n: number, opts: { annotated?: boolean } = {}) =>
	rt.runPromise(
		Effect.gen(function* () {
			const users = yield* Users;
			const coach = yield* users.ensure({ clerkUserId: 'coach_a', role: 'coach' });
			const player = yield* users.ensure({ clerkUserId: `pl_exp_${n}`, role: 'player' });
			yield* (yield* Db).query(`insert into coach_assignments (coach_id, player_id, status) values ($1, $2, 'active') on conflict do nothing`, [coach.id, player.id]);
			yield* (yield* Videos).create({ id: V(n), ownerId: player.id, kind: 'swing', sourceKey: keys.rawSource(V(n), 'mp4'), sizeBytes: 10 });
			const analysis = yield* (yield* Analyses).create({ videoId: V(n), coachId: coach.id, title: 'Driver, face on' });
			if (opts.annotated) yield* (yield* Annotations).create({ videoId: V(n), authorId: coach.id, startMs: 0, endMs: 1000, shape: arrow });
			return { id: analysis.id, player: `pl_exp_${n}` };
		})
	);

describe('POST/GET /api/analyses/:id/export', () => {
	it('is for coaches who may see the video: nobody signed out, no player, no unassigned coach', async () => {
		const { id, player } = await setup(1, { annotated: true });
		for (const effect of [requestExport, getExport]) {
			expect((await call(effect, null, { id })).status).toBe(401);
			expect((await call(effect, player, { id })).status).toBe(403);
			expect((await call(effect, 'coach_b', { id })).status).toBeGreaterThanOrEqual(403); // not assigned to this player
			expect((await call(effect, 'coach_a', { id: 'not-a-uuid' })).status).toBe(404);
		}
		expect(sent).toEqual([]);
	});

	it('refuses to export an analysis with nothing in it', async () => {
		const { id } = await setup(2);
		const res = await call(requestExport, 'coach_a', { id });
		expect(res.status).toBe(409);
		expect(res.body.message).toMatch(/nothing to export/i);
		expect(sent).toEqual([]);
	});

	it('queues one job, however often it is asked while it is queued, and says where it stands', async () => {
		const { id } = await setup(3, { annotated: true });
		expect((await call(getExport, 'coach_a', { id })).body).toMatchObject({ status: 'none', download: null });
		const first = await call(requestExport, 'coach_a', { id });
		expect(first.status).toBe(200); // runRoute answers 200; the route file turns it into 202
		expect(first.body).toMatchObject({ status: 'queued', download: null, errorCode: null });
		await call(requestExport, 'coach_a', { id });
		expect(sent).toEqual([{ name: 'analysis.assemble', payload: { analysis_id: id } }]);
		expect((await call(getExport, 'coach_a', { id })).body.status).toBe('queued');
	});

	it('gives a short-lived download once the worker has finished, and shows a failure with its code', async () => {
		const { id } = await setup(4, { annotated: true });
		await call(requestExport, 'coach_a', { id });
		await rt.runPromise(AnalysisExports.use((e) => Effect.flatMap(e.claim(id), () => e.markReady(id, { outputKey: keys.analysisExport(id), sizeBytes: 7_654_321 }))));
		r2.objects.set(keys.analysisExport(id), { sizeBytes: 7_654_321, contentType: 'video/mp4' });
		const done = (await call(getExport, 'coach_a', { id })).body;
		expect(done).toMatchObject({ status: 'ready', sizeBytes: 7_654_321, errorCode: null });
		expect(done.download.filename).toBe('Driver, face on.mp4');
		expect(done.download.url).toContain(keys.analysisExport(id));
		expect(new Date(done.download.expiresAt).getTime()).toBeGreaterThan(Date.now());

		// asking again after it finished makes a new one, and hides the old link while it is made
		const again = await call(requestExport, 'coach_a', { id });
		expect(again.body).toMatchObject({ status: 'queued', download: null });
		expect(sent).toHaveLength(2);

		await rt.runPromise(AnalysisExports.use((e) => Effect.flatMap(e.claim(id), () => e.markFailed(id, 'TRANSCODE_FAILED'))));
		expect((await call(getExport, 'coach_a', { id })).body).toMatchObject({ status: 'failed', errorCode: 'TRANSCODE_FAILED', download: null });
	});

	it('does not leave a request stuck when the job cannot be queued', async () => {
		const { id } = await setup(5, { annotated: true });
		queueDown = true;
		const res = await call(requestExport, 'coach_a', { id });
		expect(res.status).toBe(500);
		expect((await call(getExport, 'coach_a', { id })).body).toMatchObject({ status: 'failed', errorCode: 'QUEUE_FAILED' });
		queueDown = false;
		expect((await call(requestExport, 'coach_a', { id })).body.status).toBe('queued'); // can ask again at once
		expect(sent).toHaveLength(1);
	});
});
