import { Analyses, Db, Segments, Users, Videos } from '@ttg/db';
import { TestDb } from '@ttg/db/testing';
import { DEFAULT_OVERLAY, keys } from '@ttg/shared';
import { Effect, Layer, ManagedRuntime } from 'effect';
import { afterAll, describe, expect, it } from 'vitest';
import { createAnalysis, getAnalysisView, getOverlay, overlayLinkFor, putOverlay, recordAnalysisView } from './analyses';
import { CoachAllowlist } from './auth';
import { makeRunRoute } from './run-route';
import { fakeEvent } from './test-utils';

// Integration: real Users/Videos/Analyses on a throwaway migrated database.
const Services = Layer.mergeAll(Users.layer, Videos.layer, Analyses.layer, Segments.layer).pipe(Layer.provideMerge(TestDb));
const rt = ManagedRuntime.make(Layer.mergeAll(CoachAllowlist.layerFromCsv('coach_a,coach_b'), Services));
const run = makeRunRoute(rt);
afterAll(() => rt.dispose());

const call = async (effect: Effect.Effect<any, any, any>, event: ReturnType<typeof fakeEvent>) => {
	const res = await run(event, effect as never);
	return { status: res.status, body: (await res.json()) as any };
};
const ev = (userId: string | null, params: Record<string, string> = {}, body?: unknown) => fakeEvent({ userId, body, params });
const V = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const video = (ownerClerk: string, id: string, kind: 'swing' | 'reference' = 'swing', durationMs = 8000) =>
	rt.runPromise(
		Effect.gen(function* () {
			const owner = yield* (yield* Users).ensure({ clerkUserId: ownerClerk, role: ownerClerk.startsWith('coach') ? 'coach' : 'player' });
			const videos = yield* Videos;
			yield* videos.create({ id, ownerId: owner.id, kind, sourceKey: keys.rawSource(id, 'mp4'), sizeBytes: 10 });
			yield* videos.markUploaded(id, 10);
			yield* videos.claimForProcessing(id);
			yield* videos.markReady(id, { processedKey: keys.processedVideo(id), thumbnailKey: keys.poster(id), spriteKey: keys.sprite(id), durationMs, fps: 30, width: 1280, height: 720 });
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

const start = (coach: string, videoId: string) => call(createAnalysis, ev(coach, {}, { videoId }));

describe('POST /api/analyses', () => {
	it('an assigned coach starts one; players, unassigned coaches and anonymous callers cannot', async () => {
		await video('pl_a', V(1));
		await assign('coach_a', 'pl_a');
		const ok = await start('coach_a', V(1));
		expect(ok.status).toBe(200);
		expect(ok.body).toMatchObject({ videoId: V(1), title: null });
		expect((await start('pl_a', V(1))).status).toBe(403);
		expect((await start('coach_b', V(1))).status).toBe(403);
		expect((await start(null as never, V(1))).status).toBe(401);
	});

	it('422 for a malformed id or a reference clip; 404 for an unknown video', async () => {
		await video('coach_a', V(2), 'reference');
		expect((await call(createAnalysis, ev('coach_a', {}, { videoId: 'nope' }))).status).toBe(422);
		expect((await start('coach_a', V(2))).status).toBe(422);
		expect((await start('coach_a', V(900))).status).toBe(404);
	});
});

describe('overlay settings', () => {
	const setup = async (n: number, player: string) => {
		await video(player, V(n));
		await assign('coach_a', player);
		return (await start('coach_a', V(n))).body.id as string;
	};
	const put = (user: string, id: string, settings: unknown) => call(putOverlay, ev(user, { id }, settings));
	const get = (user: string | null, id: string) => call(getOverlay, ev(user, { id }));

	it('starts as the defaults; the owner and the coach read, other players do not', async () => {
		const id = await setup(10, 'pl_o');
		const mine = await get('pl_o', id);
		expect(mine.status).toBe(200);
		expect(mine.body.settings).toEqual(DEFAULT_OVERLAY);
		expect((await get('coach_a', id)).status).toBe(200);
		expect((await get('pl_other', id)).status).toBe(403);
		expect((await get('coach_b', id)).status).toBe(403);
		expect((await get(null, id)).status).toBe(401);
		expect((await get('pl_o', V(950))).status).toBe(404);
		expect((await call(getOverlay, ev('pl_o', { id: 'nope' }))).status).toBe(404);
	});

	it('the coach saves a reference overlay and the player then reads exactly that', async () => {
		const id = await setup(11, 'pl_s');
		await video('coach_a', V(12), 'reference', 6000);
		const settings = { ...DEFAULT_OVERLAY, overlayVideoId: V(12), opacity: 0.4, scale: 1.25, x: 0.05, y: -0.1, baseSyncMs: 2400, overlaySyncMs: 1800 };
		const saved = await put('coach_a', id, settings);
		expect(saved.status).toBe(200);
		expect(saved.body.settings).toEqual(settings);
		expect((await get('pl_s', id)).body.settings).toEqual(settings);
		expect(await rt.runPromise(overlayLinkFor(V(11)))).toEqual({ analysisId: id });
	});

	it('players cannot save (403) and the stored setup is untouched', async () => {
		const id = await setup(13, 'pl_p');
		expect((await put('pl_p', id, DEFAULT_OVERLAY)).status).toBe(403);
		expect((await put('coach_b', id, DEFAULT_OVERLAY)).status).toBe(403);
		expect(await rt.runPromise(overlayLinkFor(V(13)))).toBeNull();
	});

	it('the overlay video must be a reference or the same owner\'s video, even if the coach can see both players', async () => {
		const id = await setup(14, 'pl_x');
		await video('pl_y', V(15)); // another player, also assigned to the coach
		await assign('coach_a', 'pl_y');
		await video('pl_x', V(16)); // the same owner's earlier swing
		expect((await put('coach_a', id, { ...DEFAULT_OVERLAY, overlayVideoId: V(15) })).status).toBe(422);
		expect((await put('coach_a', id, { ...DEFAULT_OVERLAY, overlayVideoId: V(16) })).status).toBe(200);
		expect((await put('coach_a', id, { ...DEFAULT_OVERLAY, overlayVideoId: V(901) })).status).toBe(422);
	});

	it('rejects values outside the limits and sync points past the end of a video', async () => {
		const id = await setup(17, 'pl_v');
		for (const bad of [{ opacity: 0 }, { opacity: 2 }, { scale: 9 }, { x: 5 }, { baseSyncMs: 1.5 }, { baseSyncMs: 99_999 }, { overlayVideoId: '../x' }]) {
			expect((await put('coach_a', id, { ...DEFAULT_OVERLAY, ...bad })).status).toBe(422);
		}
		await video('coach_a', V(18), 'reference', 3000);
		expect((await put('coach_a', id, { ...DEFAULT_OVERLAY, overlayVideoId: V(18), overlaySyncMs: 3001 })).status).toBe(422);
		expect((await put('coach_a', id, { ...DEFAULT_OVERLAY, overlayVideoId: V(18), overlaySyncMs: 3000 })).status).toBe(200);
	});
});

describe('analysis opened by the player', () => {
	const published = (analysisId: string, n: number) =>
		rt.runPromise(
			Effect.gen(function* () {
				const segs = yield* Segments;
				const sid = V(n);
				yield* segs.createPending({ id: sid, analysisId, startMs: 0, endMs: 1000, sourceKey: `k${n}`, annotationsAction: 'keep' });
				yield* segs.markUploaded(sid);
				yield* segs.claimForProcessing(sid);
				yield* segs.commit(sid, { clipKey: `c${n}`, hasVideo: false });
			})
		);
	const view = (who: string | null, id: string) => call(recordAnalysisView, ev(who, { id }));
	const state = (who: string | null, videoId: string) => call(getAnalysisView, ev(who, { id: videoId }));

	it('only the owning player counts, only once published; the coach sees it, nobody else does', async () => {
		await video('pl_ov', V(300));
		await assign('coach_a', 'pl_ov');
		const a = (await start('coach_a', V(300))).body.id as string;

		// a draft: no recording, no comparison
		expect((await view('pl_ov', a)).body).toEqual({ recorded: false });
		expect((await state('coach_a', V(300))).body).toMatchObject({ state: 'unpublished', playerName: 'the player' });

		await published(a, 3001);
		expect((await state('coach_a', V(300))).body).toMatchObject({ state: 'unopened', firstViewedAt: null, updatedSinceOpened: false });

		// the coach previewing, and a stranger, do not open it
		expect((await view('coach_a', a)).body).toEqual({ recorded: false });
		await video('pl_other', V(301));
		expect((await view('pl_other', a)).status).toBe(403);
		expect((await view(null, a)).status).toBe(401);
		expect((await state('coach_a', V(300))).body.state).toBe('unopened');

		expect((await view('pl_ov', a)).body).toEqual({ recorded: true });
		const opened = (await state('coach_a', V(300))).body;
		expect(opened).toMatchObject({ state: 'opened', updatedSinceOpened: false });
		expect(Date.parse(opened.firstViewedAt)).toBeLessThanOrEqual(Date.parse(opened.lastViewedAt));
		// idempotent: one row, first time kept
		expect((await view('pl_ov', a)).body).toEqual({ recorded: true });
		expect((await state('coach_a', V(300))).body.firstViewedAt).toBe(opened.firstViewedAt);

		// a re-record after the last open: still opened, flagged as updated since
		await rt.runPromise(Effect.flatMap(Db, (db) => db.query(`update analysis_views set last_viewed_at = now() - interval '5 minutes' where analysis_id = $1`, [a])));
		await published(a, 3002);
		expect((await state('coach_a', V(300))).body).toMatchObject({ state: 'opened', updatedSinceOpened: true });

		// coach only, and only for videos they may see
		expect((await state('pl_ov', V(300))).status).toBe(403);
		expect((await state('coach_b', V(300))).status).toBe(403);
		expect((await state('coach_a', V(900))).status).toBe(404);
	});
});
