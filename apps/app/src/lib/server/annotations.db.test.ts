import { Annotations, Db, Users, Videos } from '@ttg/db';
import { TestDb } from '@ttg/db/testing';
import { MAX_ANNOTATIONS_PER_VIDEO, MAX_ANNOTATION_TEXT, keys } from '@ttg/shared';
import { Effect, Layer, ManagedRuntime } from 'effect';
import { afterAll, describe, expect, it } from 'vitest';
import { createAnnotation, deleteAnnotation, listAnnotations, updateAnnotation } from './annotations';
import { CoachAllowlist } from './auth';
import { makeRunRoute } from './run-route';
import { fakeEvent } from './test-utils';

// Integration: real Users/Videos/Annotations on a throwaway migrated database (needs `docker compose up -d db`).
const Services = Layer.mergeAll(Users.layer, Videos.layer, Annotations.layer).pipe(Layer.provideMerge(TestDb));
const rt = ManagedRuntime.make(Layer.mergeAll(CoachAllowlist.layerFromCsv('coach_a,coach_b'), Services));
const run = makeRunRoute(rt);
afterAll(() => rt.dispose());

const call = async (effect: Effect.Effect<any, any, any>, event: ReturnType<typeof fakeEvent>) => {
	const res = await run(event, effect as never);
	return { status: res.status, body: (await res.json()) as any };
};
const ev = (userId: string | null, params: Record<string, string>, body?: unknown, query = '') => fakeEvent({ userId, body, params, query });

const arrow = { v: 1, type: 'arrow', color: '#D4A017', width: 0.005, a: { x: 0.1, y: 0.2 }, b: { x: 0.8, y: 0.9 } };
const DURATION = 10_000;

const readyVideo = (ownerClerk: string, id: string, ready = true) =>
	rt.runPromise(
		Effect.gen(function* () {
			const users = yield* Users;
			const videos = yield* Videos;
			const owner = yield* users.ensure({ clerkUserId: ownerClerk, role: ownerClerk.startsWith('coach') ? 'coach' : 'player' });
			yield* videos.create({ id, ownerId: owner.id, kind: 'swing', sourceKey: keys.rawSource(id, 'mp4'), sizeBytes: 10 });
			if (ready) {
				yield* videos.markUploaded(id, 10);
				yield* videos.claimForProcessing(id);
				yield* videos.markReady(id, { processedKey: keys.processedVideo(id), thumbnailKey: keys.poster(id), spriteKey: keys.sprite(id), durationMs: DURATION, fps: 30, width: 1280, height: 720 });
			}
		})
	);
const assign = (coachClerk: string, playerClerk: string) =>
	rt.runPromise(
		Effect.gen(function* () {
			const users = yield* Users;
			const db = yield* Db;
			const c = yield* users.ensure({ clerkUserId: coachClerk, role: 'coach' });
			const p = yield* users.ensure({ clerkUserId: playerClerk, role: 'player' });
			yield* db.query(`insert into coach_assignments (coach_id, player_id, status) values ($1, $2, 'active') on conflict do nothing`, [c.id, p.id]);
		})
	);

const V = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const add = (user: string, vid: string, body: unknown) => call(createAnnotation, ev(user, { id: vid }, body));

describe('annotation API access', () => {
	it('coach with an assignment writes; the owner reads; everyone else is 403; anonymous is 401', async () => {
		const vid = V(1);
		await readyVideo('pl_a', vid);
		await assign('coach_a', 'pl_a');

		const created = await add('coach_a', vid, { startMs: 2400, endMs: 4000, shape: arrow });
		expect(created.status).toBe(200);
		expect(created.body).toMatchObject({ startMs: 2400, endMs: 4000, version: 1, videoId: vid, shape: arrow });

		// owner reads
		const mine = await call(listAnnotations, ev('pl_a', { id: vid }));
		expect(mine.status).toBe(200);
		expect(mine.body.annotations).toHaveLength(1);
		// assigned coach reads
		expect((await call(listAnnotations, ev('coach_a', { id: vid }))).status).toBe(200);

		// a different player and an unassigned coach get nothing
		expect((await call(listAnnotations, ev('pl_b', { id: vid }))).status).toBe(403);
		expect((await call(listAnnotations, ev('coach_b', { id: vid }))).status).toBe(403);
		expect((await add('coach_b', vid, { startMs: 0, endMs: 1, shape: arrow })).status).toBe(403);
		expect((await call(listAnnotations, ev(null, { id: vid }))).status).toBe(401);
	});

	it('the player who owns the video cannot create, edit or delete (403)', async () => {
		const vid = V(2);
		await readyVideo('pl_a2', vid);
		await assign('coach_a', 'pl_a2');
		const a = await add('coach_a', vid, { startMs: 0, endMs: 1000, shape: arrow });
		const params = { id: vid, annotationId: a.body.id };
		expect((await add('pl_a2', vid, { startMs: 0, endMs: 1, shape: arrow })).status).toBe(403);
		expect((await call(updateAnnotation, ev('pl_a2', params, { version: 1, endMs: 5 }))).status).toBe(403);
		expect((await call(deleteAnnotation, ev('pl_a2', params))).status).toBe(403);
		const still = await call(listAnnotations, ev('pl_a2', { id: vid }));
		expect(still.body.annotations).toHaveLength(1);
		expect(still.body.annotations[0].version).toBe(1);
	});

	it('unknown video ids are 404', async () => {
		expect((await call(listAnnotations, ev('coach_a', { id: V(99) }))).status).toBe(404);
		expect((await call(listAnnotations, ev('coach_a', { id: 'nope' }))).status).toBe(404);
	});
});

describe('annotation validation', () => {
	it('rejects shapes outside the allowlist and strips unknown properties', async () => {
		const vid = V(3);
		await readyVideo('coach_a', vid); // a coach's own video
		const bad = [
			{ ...arrow, type: 'image' },
			{ ...arrow, a: { x: 2, y: 0 } },
			{ ...arrow, color: 'javascript:alert(1)' },
			{ ...arrow, type: 'text', text: 'x'.repeat(MAX_ANNOTATION_TEXT + 1), at: { x: 0, y: 0 }, size: 0.05 }
		];
		for (const shape of bad) {
			const r = await add('coach_a', vid, { startMs: 0, endMs: 100, shape });
			expect(r.status).toBe(422);
			expect(r.body.code).toBe('ValidationError');
		}
		const ok = await add('coach_a', vid, { startMs: 0, endMs: 100, shape: { ...arrow, onclick: 'x', a: { x: 0.1, y: 0.2, z: 9 } } });
		expect(ok.status).toBe(200);
		expect(ok.body.shape).toEqual(arrow);
	});

	it('rejects bad ranges: end before start, past the end of the video, fractions, negatives', async () => {
		const vid = V(4);
		await readyVideo('coach_a', vid);
		for (const [startMs, endMs] of [[500, 100], [0, DURATION + 1], [1.5, 2], [-1, 5]]) {
			expect((await add('coach_a', vid, { startMs, endMs, shape: arrow })).status).toBe(422);
		}
		expect((await add('coach_a', vid, { startMs: DURATION, endMs: DURATION, shape: arrow })).status).toBe(200);
	});

	it('rejects a shape over the size cap', async () => {
		const vid = V(5);
		await readyVideo('coach_a', vid);
		// each point is ~20 bytes; 500 points with long decimals still fits, so inflate with long numbers
		const points = Array.from({ length: 500 }, (_, i) => ({ x: 0.123456789012345 + i * 1e-9, y: 0.987654321098765 - i * 1e-9 }));
		const r = await add('coach_a', vid, { startMs: 0, endMs: 10, shape: { v: 1, type: 'freehand', color: '#FFFFFF', width: 0.004, points } });
		expect(r.status).toBe(422);
		expect(r.body.message).toMatch(/too large/);
	});

	it('refuses a video that is not ready yet', async () => {
		const vid = V(6);
		await readyVideo('coach_a', vid, false);
		expect((await add('coach_a', vid, { startMs: 0, endMs: 1, shape: arrow })).status).toBe(409);
	});

	it('caps the number of annotations per video', async () => {
		const vid = V(7);
		await readyVideo('coach_a', vid);
		await rt.runPromise(
			Effect.gen(function* () {
				const db = yield* Db;
				const coach = yield* (yield* Users).ensure({ clerkUserId: 'coach_a', role: 'coach' });
				yield* db.query(
					`insert into annotations (video_id, author_id, start_ms, end_ms, shape)
					 select $1, $2, 0, 1, $3::jsonb from generate_series(1, $4)`,
					[vid, coach.id, JSON.stringify(arrow), MAX_ANNOTATIONS_PER_VIDEO]
				);
			})
		);
		const r = await add('coach_a', vid, { startMs: 0, endMs: 1, shape: arrow });
		expect(r.status).toBe(422);
		expect(r.body.message).toMatch(/at most/);
	});
});

describe('annotation edits', () => {
	it('PATCH bumps the version; a second session with the stale version gets 409 and the data is intact', async () => {
		const vid = V(8);
		await readyVideo('coach_a', vid);
		const a = await add('coach_a', vid, { startMs: 1000, endMs: 2000, shape: arrow });
		const params = { id: vid, annotationId: a.body.id };

		const first = await call(updateAnnotation, ev('coach_a', params, { version: 1, endMs: 3000 }));
		expect(first.status).toBe(200);
		expect(first.body).toMatchObject({ version: 2, startMs: 1000, endMs: 3000 });

		const stale = await call(updateAnnotation, ev('coach_a', params, { version: 1, endMs: 9000 }));
		expect(stale.status).toBe(409);
		expect(stale.body.code).toBe('Conflict');

		const list = await call(listAnnotations, ev('coach_a', { id: vid }));
		expect(list.body.annotations[0]).toMatchObject({ version: 2, endMs: 3000 });
	});

	it('PATCH checks the merged range and the new shape', async () => {
		const vid = V(9);
		await readyVideo('coach_a', vid);
		const a = await add('coach_a', vid, { startMs: 1000, endMs: 2000, shape: arrow });
		const params = { id: vid, annotationId: a.body.id };
		// only startMs sent, but it would land after the stored endMs
		expect((await call(updateAnnotation, ev('coach_a', params, { version: 1, startMs: 5000 }))).status).toBe(422);
		expect((await call(updateAnnotation, ev('coach_a', params, { version: 1, shape: { ...arrow, type: 'nope' } }))).status).toBe(422);
		expect((await call(updateAnnotation, ev('coach_a', params, { endMs: 5 }))).status).toBe(422); // no version
		const moved = await call(updateAnnotation, ev('coach_a', params, { version: 1, shape: { ...arrow, color: '#FFFFFF' } }));
		expect(moved.body.shape.color).toBe('#FFFFFF');
	});

	it('an annotation id from another video is 404', async () => {
		const v1 = V(10);
		const v2 = V(11);
		await readyVideo('coach_a', v1);
		await readyVideo('coach_a', v2);
		const a = await add('coach_a', v1, { startMs: 0, endMs: 1, shape: arrow });
		const params = { id: v2, annotationId: a.body.id };
		expect((await call(updateAnnotation, ev('coach_a', params, { version: 1, endMs: 5 }))).status).toBe(404);
		expect((await call(deleteAnnotation, ev('coach_a', params))).status).toBe(404);
		expect((await call(deleteAnnotation, ev('coach_a', { id: v1, annotationId: 'not-a-uuid' }))).status).toBe(404);
	});

	it('DELETE removes it; with a stale version it is 409 and nothing is deleted', async () => {
		const vid = V(12);
		await readyVideo('coach_a', vid);
		const a = await add('coach_a', vid, { startMs: 0, endMs: 1, shape: arrow });
		const params = { id: vid, annotationId: a.body.id };
		expect((await call(deleteAnnotation, ev('coach_a', params, undefined, '?version=4'))).status).toBe(409);
		expect((await call(deleteAnnotation, ev('coach_a', params, undefined, '?version=abc'))).status).toBe(422);
		expect((await call(deleteAnnotation, ev('coach_a', params, undefined, '?version=1'))).status).toBe(200);
		expect((await call(listAnnotations, ev('coach_a', { id: vid }))).body.annotations).toHaveLength(0);
		expect((await call(deleteAnnotation, ev('coach_a', params))).status).toBe(404);
	});
});
