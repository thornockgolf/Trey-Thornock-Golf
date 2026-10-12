import { Annotations, Queue, Users, Videos } from '@ttg/db';
import { TestDb } from '@ttg/db/testing';
import { keys } from '@ttg/shared';
import { Effect, Layer, ManagedRuntime } from 'effect';
import { afterAll, describe, expect, it } from 'vitest';
import { createAnnotation, listAnnotations } from './annotations';
import { CoachAllowlist } from './auth';
import { makeFakeR2 } from './r2-fake';
import { makeRunRoute } from './run-route';
import { fakeEvent } from './test-utils';
import { completeVideo, createVideo, downloadVideo, listMyVideos, listReferences, playbackVideo } from './videos';

// Integration: the reference library on a real database, in-memory R2 and queue.
const r2 = makeFakeR2();
const FakeQueue = Layer.succeed(Queue, Queue.of({ send: () => Effect.succeed('job-1'), work: () => Effect.void }));
const Services = Layer.mergeAll(Users.layer, Videos.layer, Annotations.layer).pipe(Layer.provideMerge(TestDb));
const rt = ManagedRuntime.make(Layer.mergeAll(CoachAllowlist.layerFromCsv('coach_a,coach_b'), r2.layer, FakeQueue).pipe(Layer.provideMerge(Services)));
const run = makeRunRoute(rt);
afterAll(() => rt.dispose());

const call = async (effect: Effect.Effect<any, any, any>, event: ReturnType<typeof fakeEvent>) => {
	const res = await run(event, effect as never);
	return { status: res.status, body: (await res.json()) as any };
};
const ev = (userId: string | null, params: Record<string, string> = {}, body?: unknown, query = '') => fakeEvent({ userId, body, params, query });

const upload = (user: string, extra: Record<string, unknown> = {}) =>
	call(createVideo, ev(user, {}, { contentType: 'video/mp4', sizeBytes: 1_000_000, ...extra }));
const makeReady = (id: string) =>
	rt.runPromise(
		Effect.gen(function* () {
			const v = yield* Videos;
			yield* v.markUploaded(id, 1000);
			yield* v.claimForProcessing(id);
			yield* v.markReady(id, { processedKey: keys.processedVideo(id), thumbnailKey: keys.poster(id), spriteKey: keys.sprite(id), durationMs: 4000, fps: 30, width: 1280, height: 720 });
		})
	);
const arrow = { v: 1, type: 'arrow', color: '#D4A017', width: 0.005, a: { x: 0.1, y: 0.2 }, b: { x: 0.8, y: 0.9 } };

describe('reference upload', () => {
	it('a coach uploads a reference through the normal pipeline; kind and title are stored', async () => {
		const r = await upload('coach_a', { kind: 'reference', title: ' Rory, driver ' });
		expect(r.status).toBe(200);
		expect(r.body.video).toMatchObject({ kind: 'reference', status: 'pending', title: 'Rory, driver' });
		expect(r.body.upload.url).toContain(`raw/${r.body.video.id}/source.mp4`);
	});

	it('a player cannot upload a reference (403) and a coach needs a title (422)', async () => {
		expect((await upload('pl_a', { kind: 'reference', title: 'x' })).status).toBe(403);
		expect((await upload('coach_a', { kind: 'reference' })).status).toBe(422);
		expect((await upload('coach_a', { kind: 'reference', title: '   ' })).status).toBe(422);
		expect((await upload('pl_a', { kind: 'bogus' })).status).toBe(422);
	});

	it('defaults to a swing', async () => {
		expect((await upload('pl_a')).body.video.kind).toBe('swing');
	});

	it('only the owning coach can complete the upload', async () => {
		const r = await upload('coach_a', { kind: 'reference', title: 'Owner only' });
		r2.objects.set(keys.rawSource(r.body.video.id, 'mp4'), { sizeBytes: 1000, contentType: 'video/mp4' });
		expect((await call(completeVideo, ev('coach_b', { id: r.body.video.id }))).status).toBe(403);
		expect((await call(completeVideo, ev('pl_a', { id: r.body.video.id }))).status).toBe(403);
		expect((await call(completeVideo, ev('coach_a', { id: r.body.video.id }))).status).toBe(200);
	});
});

describe('reference library', () => {
	it('players see ready references only; the coach also sees ones still processing; swings never appear', async () => {
		const ready = await upload('coach_a', { kind: 'reference', title: 'Ready one' });
		const busy = await upload('coach_a', { kind: 'reference', title: 'Busy one' });
		const swing = await upload('pl_lib');
		await makeReady(ready.body.video.id);
		await makeReady(swing.body.video.id);
		await rt.runPromise(Effect.flatMap(Videos, (v) => v.markUploaded(busy.body.video.id, 1000)));

		const player = await call(listReferences, ev('pl_lib'));
		expect(player.status).toBe(200);
		const titles = player.body.videos.map((v: any) => v.title);
		expect(titles).toContain('Ready one');
		expect(titles).not.toContain('Busy one');
		expect(player.body.videos.every((v: any) => v.kind === 'reference')).toBe(true);
		expect(player.body.videos.find((v: any) => v.title === 'Ready one').posterUrl).toContain(keys.poster(ready.body.video.id));
		expect(JSON.stringify(player.body)).not.toContain('source_key');

		const coach = await call(listReferences, ev('coach_a'));
		expect(coach.body.videos.map((v: any) => v.title)).toEqual(expect.arrayContaining(['Ready one', 'Busy one']));

		expect((await call(listReferences, ev(null))).status).toBe(401);
	});

	it('the coach\'s own video list does not include references', async () => {
		await upload('coach_a', { kind: 'reference', title: 'Not a swing' });
		const mine = await call(listMyVideos, ev('coach_a'));
		expect(mine.body.videos.some((v: any) => v.kind === 'reference')).toBe(false);
	});
});

describe('reference access', () => {
	it('any signed-in user can play a ready reference; processed download is allowed, the original is the owner\'s', async () => {
		const r = await upload('coach_a', { kind: 'reference', title: 'Playable' });
		const params = { id: r.body.video.id };
		expect((await call(playbackVideo, ev('pl_x', params))).status).toBe(409); // not ready yet
		await makeReady(r.body.video.id);
		const play = await call(playbackVideo, ev('pl_x', params));
		expect(play.status).toBe(200);
		expect(play.body.url).toContain(keys.processedVideo(r.body.video.id));
		expect((await call(downloadVideo, ev('pl_x', params, undefined, '?variant=processed'))).status).toBe(200);
		expect((await call(downloadVideo, ev('pl_x', params, undefined, '?variant=original'))).status).toBe(403);
		expect((await call(downloadVideo, ev('coach_b', params, undefined, '?variant=original'))).status).toBe(403);
		expect((await call(downloadVideo, ev('coach_a', params, undefined, '?variant=original'))).status).toBe(200);
		expect((await call(playbackVideo, ev(null, params))).status).toBe(401);
	});

	it('a player\'s swing is still private (the reference rule does not leak)', async () => {
		const swing = await upload('pl_priv');
		await makeReady(swing.body.video.id);
		expect((await call(playbackVideo, ev('pl_other', { id: swing.body.video.id }))).status).toBe(403);
	});

	it('references carry annotations: everyone reads, only a coach writes', async () => {
		const r = await upload('coach_a', { kind: 'reference', title: 'Annotated' });
		const params = { id: r.body.video.id };
		await makeReady(r.body.video.id);
		const made = await call(createAnnotation, ev('coach_a', params, { startMs: 100, endMs: 900, shape: arrow }));
		expect(made.status).toBe(200);
		const seen = await call(listAnnotations, ev('pl_x', params));
		expect(seen.status).toBe(200);
		expect(seen.body.annotations).toHaveLength(1);
		expect((await call(createAnnotation, ev('pl_x', params, { startMs: 0, endMs: 1, shape: arrow }))).status).toBe(403);
	});
});
