import { Assessments, Billing, CheckIns, Coaching, Drills, Plans, Users, Videos } from '@ttg/db';
import { TestDb } from '@ttg/db/testing';
import { keys } from '@ttg/shared';
import { Effect, Layer, ManagedRuntime } from 'effect';
import { afterAll, describe, expect, it } from 'vitest';
import { CoachAllowlist } from './auth';
import { createAssessment, getCalendar, listAssessments, listCheckIns, listResults, recordResult, scheduleAssessment, scheduleCheckIn, submitCheckIn } from './calendar';
import { makeRunRoute } from './run-route';
import { autoPay, fakeEvent } from './test-utils';

// Integration: check-ins, assessments and the calendar on a real database.
const Services = Layer.mergeAll(Users.layer, Videos.layer, Coaching.layer, CheckIns.layer, Assessments.layer, Plans.layer, Drills.layer, Billing.layer).pipe(Layer.provideMerge(TestDb));
const rt = ManagedRuntime.make(Layer.mergeAll(CoachAllowlist.layerFromCsv('coach_a,coach_b'), Services));
const run0 = makeRunRoute(rt);
const pay = autoPay(rt, ['coach_a', 'coach_b']);
const run: typeof run0 = async (event, effect) => {
	await pay(event.locals.auth().userId);
	return run0(event, effect);
};
afterAll(() => rt.dispose());

const call = async (effect: Effect.Effect<any, any, any>, user: string | null, o: { params?: Record<string, string>; body?: unknown; query?: string } = {}) => {
	const res = await run(fakeEvent({ userId: user, params: o.params, body: o.body, query: o.query }), effect as never);
	return { status: res.status, body: (await res.json()) as any };
};
const u = (clerk: string, role: 'player' | 'coach' = 'player') => rt.runPromise(Effect.flatMap(Users, (x) => x.ensure({ clerkUserId: clerk, role })));
const pair = async (coach: string, player: string) => {
	const c = await u(coach, 'coach');
	const p = await u(player);
	await rt.runPromise(Effect.flatMap(Coaching, (x) => x.assign(c.id, p.id)));
	return { c, p };
};
const answers = { roundsPlayed: 2, confidence: 4, issues: 'Pulled my irons' };

describe('check-ins', () => {
	it('the coach schedules (weekly repeats), players cannot, unpaired coaches cannot, bad dates are refused', async () => {
		const { p } = await pair('coach_a', 'pl_ci1');
		await u('coach_b', 'coach');
		const ok = await call(scheduleCheckIn, 'coach_a', { body: { playerId: p.id, scheduledOn: '2026-10-20', repeatWeeks: 2 } });
		expect(ok.status).toBe(200);
		expect(ok.body.checkIns.map((c: any) => c.scheduledOn)).toEqual(['2026-10-20', '2026-10-27', '2026-11-03']);
		expect((await call(scheduleCheckIn, 'pl_ci1', { body: { playerId: p.id, scheduledOn: '2026-10-20' } })).status).toBe(403);
		expect((await call(scheduleCheckIn, 'coach_b', { body: { playerId: p.id, scheduledOn: '2026-10-20' } })).status).toBe(403);
		expect((await call(scheduleCheckIn, 'coach_a', { body: { playerId: p.id, scheduledOn: '2026-02-30' } })).status).toBe(422);
		expect((await call(scheduleCheckIn, 'coach_a', { body: { playerId: p.id, scheduledOn: '2026-10-20', repeatWeeks: 99 } })).status).toBe(422);
		expect((await call(scheduleCheckIn, null, { body: {} })).status).toBe(401);
	});

	it('the player submits their own once, and it shows in their history; others cannot; a video must be theirs', async () => {
		const { p } = await pair('coach_a', 'pl_ci2');
		const other = await u('pl_ci3');
		const made = await call(scheduleCheckIn, 'coach_a', { body: { playerId: p.id, scheduledOn: '2026-10-20' } });
		const id = made.body.checkIns[0].id;
		expect((await call(submitCheckIn, 'pl_ci3', { params: { id }, body: { answers } })).status).toBe(404);
		expect((await call(submitCheckIn, 'coach_a', { params: { id }, body: { answers } })).status).toBe(403);
		for (const bad of [{ roundsPlayed: -1, confidence: 4 }, { roundsPlayed: 1, confidence: 9 }, {}]) {
			expect((await call(submitCheckIn, 'pl_ci2', { params: { id }, body: { answers: bad } })).status).toBe(422);
		}
		// someone else's video
		const vid = '00000000-0000-4000-8000-0000000c1c01';
		await rt.runPromise(Effect.flatMap(Videos, (v) => v.create({ id: vid, ownerId: other.id, kind: 'swing', sourceKey: keys.rawSource(vid, 'mp4'), sizeBytes: 1 })));
		expect((await call(submitCheckIn, 'pl_ci2', { params: { id }, body: { answers: { ...answers, videoId: vid } } })).status).toBe(422);

		const done = await call(submitCheckIn, 'pl_ci2', { params: { id }, body: { answers } });
		expect(done.status).toBe(200);
		expect(done.body.answers).toEqual(answers);
		expect((await call(submitCheckIn, 'pl_ci2', { params: { id }, body: { answers } })).status).toBe(409);
		const mine = await call(listCheckIns, 'pl_ci2');
		expect(mine.body.checkIns.map((c: any) => [c.scheduledOn, c.answers?.confidence])).toEqual([['2026-10-20', 4]]);
		expect((await call(listCheckIns, 'pl_ci3')).body.checkIns).toEqual([]);
	});
});

describe('assessments', () => {
	const define = (name: string, unit = 'yd') => call(createAssessment, 'coach_a', { body: { name, unit } });

	it('only coaches define tests; names are unique', async () => {
		await u('coach_a', 'coach');
		await u('pl_as0');
		expect((await define('Carry distance')).status).toBe(200);
		expect((await define('Carry distance')).status).toBe(409);
		expect((await call(createAssessment, 'pl_as0', { body: { name: 'x' } })).status).toBe(403);
		expect((await call(createAssessment, 'coach_a', { body: { name: '' } })).status).toBe(422);
		expect((await call(listAssessments, 'coach_a')).body.assessments.map((a: any) => a.name)).toContain('Carry distance');
		expect((await call(listAssessments, 'pl_as0')).body.assessments).toEqual([]);
	});

	it('schedule, record, and the player sees the value and the trend; players cannot record', async () => {
		const { p } = await pair('coach_a', 'pl_as1');
		const test = (await define('Putts in 5 min', 'putts')).body;
		const sched = await call(scheduleAssessment, 'coach_a', { params: { id: test.id }, body: { playerId: p.id, scheduledOn: '2026-10-10' } });
		expect(sched.status).toBe(200);
		expect(sched.body.value).toBeNull();

		// it is on the player's calendar as scheduled
		const before = await call(getCalendar, 'pl_as1');
		expect(before.body.results.map((r: any) => [r.date, r.value])).toEqual([['2026-10-10', null]]);

		expect((await call(recordResult, 'pl_as1', { params: { id: test.id }, body: { playerId: p.id, value: 30, resultId: sched.body.id } })).status).toBe(403);
		const first = await call(recordResult, 'coach_a', { params: { id: test.id }, body: { playerId: p.id, value: 30, resultId: sched.body.id } });
		expect(first.status).toBe(200);
		expect(first.body).toMatchObject({ value: 30, trend: null });

		const s2 = await call(scheduleAssessment, 'coach_a', { params: { id: test.id }, body: { playerId: p.id, scheduledOn: '2026-10-24' } });
		const second = await call(recordResult, 'coach_a', { params: { id: test.id }, body: { playerId: p.id, value: 34, resultId: s2.body.id } });
		expect(second.body).toMatchObject({ value: 34, previousValue: 30, change: 4, trend: 'up' });

		const over = await call(listResults, 'pl_as1', { params: { id: test.id } });
		expect(over.body.results.map((r: any) => [r.value, r.trend])).toEqual([[30, null], [34, 'up']]);
		expect((await call(listAssessments, 'pl_as1')).body.assessments.map((a: any) => a.id)).toEqual([test.id]);
		// recording twice into the same scheduled slot, or for an unknown test
		expect((await call(recordResult, 'coach_a', { params: { id: test.id }, body: { playerId: p.id, value: 1, resultId: s2.body.id } })).status).toBe(404);
		expect((await call(recordResult, 'coach_a', { params: { id: '00000000-0000-4000-8000-0000000000ee' }, body: { playerId: p.id, value: 1 } })).status).toBe(404);
	});

	it('an unpaired coach can neither schedule nor record, and values must be numbers', async () => {
		const { p } = await pair('coach_a', 'pl_as2');
		const test = (await define('Wedge proximity', 'ft')).body;
		await u('coach_b', 'coach');
		expect((await call(scheduleAssessment, 'coach_b', { params: { id: test.id }, body: { playerId: p.id, scheduledOn: '2026-10-10' } })).status).toBe(403);
		expect((await call(recordResult, 'coach_b', { params: { id: test.id }, body: { playerId: p.id, value: 5 } })).status).toBe(403);
		expect((await call(recordResult, 'coach_a', { params: { id: test.id }, body: { playerId: p.id, value: 'five' } })).status).toBe(422);
		expect((await call(scheduleAssessment, 'coach_a', { params: { id: test.id }, body: { playerId: p.id, scheduledOn: '2026-13-01' } })).status).toBe(422);
	});
});

describe('calendar scoping', () => {
	it('a player reads only their own; a coach must name an assigned player', async () => {
		const { p } = await pair('coach_a', 'pl_cal1');
		const other = await u('pl_cal2');
		await u('coach_b', 'coach');
		await call(scheduleCheckIn, 'coach_a', { body: { playerId: p.id, scheduledOn: '2026-10-20' } });
		expect((await call(getCalendar, 'pl_cal1')).body.checkIns).toHaveLength(1);
		expect((await call(getCalendar, 'pl_cal2')).body.checkIns).toEqual([]);
		expect((await call(getCalendar, 'coach_a')).status).toBe(422); // names no one
		expect((await call(getCalendar, 'coach_a', { query: `?playerId=${p.id}` })).body.checkIns).toHaveLength(1);
		expect((await call(getCalendar, 'coach_b', { query: `?playerId=${p.id}` })).status).toBe(403);
		expect((await call(getCalendar, 'coach_a', { query: `?playerId=${other.id}` })).status).toBe(403);
		expect((await call(getCalendar, 'coach_a', { query: '?playerId=nope' })).status).toBe(422);
		expect((await call(getCalendar, null)).status).toBe(401);
	});
});
