import { Analyses, Db, Users, Videos } from '@ttg/db';
import { TestDb } from '@ttg/db/testing';
import { DEFAULT_OVERLAY, keys } from '@ttg/shared';
import { Effect, Layer, ManagedRuntime } from 'effect';
import { afterAll, describe, expect, it } from 'vitest';
import { CoachAllowlist } from './auth';
import { compareData } from './compare';
import { makeRunRoute } from './run-route';
import { fakeEvent } from './test-utils';

const Services = Layer.mergeAll(Users.layer, Videos.layer, Analyses.layer).pipe(Layer.provideMerge(TestDb));
const rt = ManagedRuntime.make(Layer.mergeAll(CoachAllowlist.layerFromCsv('coach_a,coach_b'), Services));
const run = makeRunRoute(rt);
afterAll(() => rt.dispose());

const call = async (user: string | null, query = '') => {
	const res = await run(fakeEvent({ userId: user, query }), compareData as never);
	return { status: res.status, body: (await res.json()) as any };
};
const V = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const video = (ownerClerk: string, id: string, opts: { kind?: 'swing' | 'reference'; ready?: boolean } = {}) =>
	rt.runPromise(
		Effect.gen(function* () {
			const owner = yield* (yield* Users).ensure({ clerkUserId: ownerClerk, role: ownerClerk.startsWith('coach') ? 'coach' : 'player' });
			const videos = yield* Videos;
			yield* videos.create({ id, ownerId: owner.id, kind: opts.kind ?? 'swing', sourceKey: keys.rawSource(id, 'mp4'), sizeBytes: 10, title: id.slice(-2) });
			if (opts.ready === false) return;
			yield* videos.markUploaded(id, 10);
			yield* videos.claimForProcessing(id);
			yield* videos.markReady(id, { processedKey: keys.processedVideo(id), thumbnailKey: keys.poster(id), spriteKey: keys.sprite(id), durationMs: 5000, fps: 30, width: 1280, height: 720 });
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

describe('compareData', () => {
	it('lists the caller\'s ready swings and the ready references, never someone else\'s swings or unfinished videos', async () => {
		await video('pl_a', V(1));
		await video('pl_a', V(2), { ready: false });
		await video('pl_b', V(3));
		await video('coach_a', V(4), { kind: 'reference' });
		await video('coach_a', V(5), { kind: 'reference', ready: false });
		const r = await call('pl_a');
		expect(r.status).toBe(200);
		expect(r.body.role).toBe('player');
		expect(r.body.own.map((v: any) => v.id)).toEqual([V(1)]);
		expect(r.body.references.map((v: any) => v.id)).toEqual([V(4)]);
		expect(r.body.others).toEqual([]);
		expect(JSON.stringify(r.body)).not.toContain('source_key');
		expect((await call(null)).status).toBe(401);
	});

	it('a coach opening a player\'s video by id gets it only when assigned', async () => {
		await video('pl_c', V(10));
		const before = await call('coach_a', `?a=${V(10)}`);
		expect(before.body.others).toEqual([]);
		await assign('coach_a', 'pl_c');
		const after = await call('coach_a', `?a=${V(10)}&b=${V(4)}`);
		expect(after.body.others.map((v: any) => v.id)).toEqual([V(10)]); // V(4) is a reference: already in the list
		expect((await call('coach_b', `?a=${V(10)}`)).body.others).toEqual([]);
		expect((await call('pl_a', `?a=${V(10)}`)).body.others).toEqual([]);
		expect((await call('coach_a', '?a=not-a-uuid')).status).toBe(200);
	});

	it('a saved overlay setup is returned to the owner and the coach, and to nobody else', async () => {
		await video('pl_d', V(20));
		await video('pl_d', V(21));
		await assign('coach_a', 'pl_d');
		const analysisId = await rt.runPromise(
			Effect.gen(function* () {
				const coach = yield* (yield* Users).ensure({ clerkUserId: 'coach_a', role: 'coach' });
				const an = yield* Analyses;
				const a = yield* an.create({ videoId: V(20), coachId: coach.id });
				yield* an.setOverlay(a.id, { ...DEFAULT_OVERLAY, overlayVideoId: V(21), opacity: 0.4, baseSyncMs: 1000, overlaySyncMs: 500 });
				return a.id;
			})
		);
		const owner = await call('pl_d', `?analysis=${analysisId}`);
		expect(owner.body.analysis).toMatchObject({ id: analysisId, videoId: V(20), settings: { overlayVideoId: V(21), opacity: 0.4, baseSyncMs: 1000, overlaySyncMs: 500 } });
		expect(owner.body.own.map((v: any) => v.id)).toEqual(expect.arrayContaining([V(20), V(21)]));
		expect((await call('coach_a', `?analysis=${analysisId}`)).body.analysis?.id).toBe(analysisId);
		// the coach's list gains the player's two videos so the page can show them
		expect((await call('coach_a', `?analysis=${analysisId}`)).body.others.map((v: any) => v.id).sort()).toEqual([V(20), V(21)]);
		expect((await call('pl_a', `?analysis=${analysisId}`)).body.analysis).toBeNull();
		expect((await call('coach_b', `?analysis=${analysisId}`)).body.analysis).toBeNull();
		expect((await call('pl_d', `?analysis=${V(999)}`)).body.analysis).toBeNull();
	});
});
