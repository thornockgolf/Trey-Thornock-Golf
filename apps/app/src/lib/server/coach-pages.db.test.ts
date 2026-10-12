import { Coaching, Drills, Plans, Questionnaires, Users, Videos } from '@ttg/db';
import { TestDb } from '@ttg/db/testing';
import { QUESTIONNAIRE_FORM_VERSION, keys } from '@ttg/shared';
import { Effect, Layer, ManagedRuntime } from 'effect';
import { afterAll, describe, expect, it } from 'vitest';
import { CoachAllowlist } from './auth';
import { dashboardData, playerDetailData } from './players';
import { makeFakeR2 } from './r2-fake';
import { makeRunRoute } from './run-route';
import { fakeEvent } from './test-utils';

// Integration: the coach's dashboard and player page on a real database with an in-memory R2.
const Services = Layer.mergeAll(Users.layer, Videos.layer, Coaching.layer, Drills.layer, Plans.layer, Questionnaires.layer).pipe(Layer.provideMerge(TestDb));
const rt = ManagedRuntime.make(Layer.mergeAll(CoachAllowlist.layerFromCsv('coach_a,coach_b'), makeFakeR2().layer, Services));
const run = makeRunRoute(rt);
afterAll(() => rt.dispose());

const call = async (effect: Effect.Effect<any, any, any>, user: string | null, params: Record<string, string> = {}) => {
	const res = await run(fakeEvent({ userId: user, params }), effect as never);
	return { status: res.status, body: (await res.json()) as any };
};
const user = (clerk: string, role: 'player' | 'coach' = 'player') => rt.runPromise(Effect.flatMap(Users, (u) => u.ensure({ clerkUserId: clerk, role })));
const V = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

describe('dashboard', () => {
	it('is for coaches only', async () => {
		await user('pl_d1');
		expect((await call(dashboardData, 'pl_d1')).status).toBe(403);
		expect((await call(dashboardData, null)).status).toBe(401);
		expect((await call(dashboardData, 'coach_a')).body.players.some((p: any) => p.id)).toBe(true);
	});
});

describe('player page', () => {
	it('shows an assigned player their questionnaire, videos, plan progress and notes; nobody else gets it', async () => {
		const coach = await user('coach_a', 'coach');
		const pl = await user('pl_d2');
		await user('coach_b', 'coach');

		// not assigned yet: 403 even for a real player; unknown ids 404; a coach id is not a player
		expect((await call(playerDetailData, 'coach_a', { id: pl.id })).status).toBe(403);
		expect((await call(playerDetailData, 'coach_a', { id: V(900) })).status).toBe(404);
		expect((await call(playerDetailData, 'coach_a', { id: coach.id })).status).toBe(404);

		await rt.runPromise(
			Effect.gen(function* () {
				const coaching = yield* Coaching;
				yield* coaching.assign(coach.id, pl.id);
				yield* coaching.addNote(coach.id, pl.id, 'Grip too strong');
				yield* (yield* Questionnaires).save({ userId: pl.id, formVersion: QUESTIONNAIRE_FORM_VERSION, values: { experience: '3to10', handicap: 14 }, complete: false });
				yield* (yield* Questionnaires).save({ userId: pl.id, formVersion: QUESTIONNAIRE_FORM_VERSION, values: { experience: '3to10', handicap: 14 }, complete: true });
				const videos = yield* Videos;
				yield* videos.create({ id: V(7001), ownerId: pl.id, kind: 'swing', sourceKey: keys.rawSource(V(7001), 'mp4'), sizeBytes: 1, title: 'Driver' });
				yield* videos.markUploaded(V(7001), 1);
				yield* videos.claimForProcessing(V(7001));
				yield* videos.markReady(V(7001), { processedKey: keys.processedVideo(V(7001)), thumbnailKey: keys.poster(V(7001)), spriteKey: keys.sprite(V(7001)), durationMs: 5000, fps: 30, width: 1280, height: 720 });
				const drill = (yield* (yield* Drills).list())[0]!;
				const plan = yield* (yield* Plans).create({ authorId: coach.id, title: 'P', structure: { v: 1, sessions: [{ title: 'S1', durationMin: 30, items: [{ drillId: drill.id, minutes: 30 }] }] } });
				yield* (yield* Plans).assign({ planId: plan.id, coachId: coach.id, playerId: pl.id, startsOn: '2026-10-20', dates: ['2026-10-20'] });
			})
		);

		const r = await call(playerDetailData, 'coach_a', { id: pl.id });
		expect(r.status).toBe(200);
		expect(r.body.notes.map((n: any) => n.body)).toEqual(['Grip too strong']);
		expect(r.body.questionnaire.answers).toMatchObject({ experience: '3to10', handicap: 14 });
		expect(r.body.videos.map((v: any) => v.title)).toEqual(['Driver']);
		expect(r.body.videos[0].posterUrl).toContain(keys.poster(V(7001)));
		expect(r.body.sessions.map((s: any) => [s.title, s.durationMin])).toEqual([['S1', 30]]);
		expect(JSON.stringify(r.body)).not.toContain('source_key');

		// another coach, a player, an anonymous caller
		expect((await call(playerDetailData, 'coach_b', { id: pl.id })).status).toBe(403);
		expect((await call(playerDetailData, 'pl_d2', { id: pl.id })).status).toBe(403);
		expect((await call(playerDetailData, 'pl_d3', { id: pl.id })).status).toBe(403);
		expect((await call(playerDetailData, null, { id: pl.id })).status).toBe(401);
	});
});
