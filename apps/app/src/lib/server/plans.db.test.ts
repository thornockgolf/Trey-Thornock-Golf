import { Db, Drills, Plans, Users } from '@ttg/db';
import { TestDb } from '@ttg/db/testing';
import { Effect, Layer, ManagedRuntime } from 'effect';
import { afterAll, describe, expect, it } from 'vitest';
import { CoachAllowlist } from './auth';
import {
	assignPlan,
	createDrill,
	createPlan,
	getDrill,
	getPlan,
	listDrills,
	listMySessions,
	listPlans,
	homeDataFor,
	plansPageData,
	setSessionItemCompleted,
	updateDrill,
	updatePlan
} from './plans';
import { makeRunRoute } from './run-route';
import { fakeEvent } from './test-utils';

// Integration: real services on a throwaway migrated database (needs `docker compose up -d db`).
const Services = Layer.mergeAll(Users.layer, Drills.layer, Plans.layer).pipe(Layer.provideMerge(TestDb));
const rt = ManagedRuntime.make(Layer.mergeAll(CoachAllowlist.layerFromCsv('coach_a'), Services));
const run = makeRunRoute(rt);
afterAll(() => rt.dispose());

const call = async (effect: Effect.Effect<any, any, any>, userId: string | null, body?: unknown, params: Record<string, string> = {}) => {
	const res = await run(fakeEvent({ userId, body, params }), effect as never);
	return { status: res.status, body: (await res.json()) as any };
};

const seeded = async () => (await call(listDrills, 'coach_a')).body.drills as { id: string; name: string; defaultMinutes: number }[];
const session = (title: string, durationMin: number, items: { drillId: string; minutes: number }[]) => ({ title, durationMin, items });

describe('access', () => {
	it('players get 403 and anonymous 401 on every drill and plan endpoint', async () => {
		const id = '00000000-0000-4000-8000-000000000001';
		const plan = { title: 'x', structure: { v: 1, sessions: [session('a', 30, [{ drillId: id, minutes: 30 }])] } };
		const attempts: [Effect.Effect<any, any, any>, unknown, Record<string, string>][] = [
			[listDrills, undefined, {}],
			[createDrill, { name: 'Sneaky' }, {}],
			[getDrill, undefined, { id }],
			[updateDrill, { purpose: 'x' }, { id }],
			[listPlans, undefined, {}],
			[createPlan, plan, {}],
			[getPlan, undefined, { id }],
			[updatePlan, { title: 'x' }, { id }]
		];
		for (const [effect, body, params] of attempts) {
			expect((await call(effect, 'pl_1', body, params)).status).toBe(403);
			expect((await call(effect, null, body, params)).status).toBe(401);
		}
		expect((await call(listDrills, 'coach_a')).status).toBe(200);
	});
});

describe('drill library', () => {
	it('is seeded from the legacy drills', async () => {
		const drills = await seeded();
		expect(drills.length).toBe(8);
		expect(drills.map((d) => d.name)).toContain('Start Line Gate');
		const gate = (await call(getDrill, 'coach_a', undefined, { id: drills.find((d) => d.name === 'Start Line Gate')!.id })).body;
		expect(gate).toMatchObject({ defaultMinutes: 10 });
		expect(gate.steps.length).toBeGreaterThan(0);
		expect(gate.successCriteria).toContain('7 out of 10');
	});

	it('creates and edits a drill; names stay unique', async () => {
		const made = await call(createDrill, 'coach_a', { name: 'Gate Warm-up', purpose: 'Loosen up', steps: ['Swing easy'], defaultMinutes: 5 });
		expect(made.status).toBe(200);
		expect(made.body).toMatchObject({ name: 'Gate Warm-up', steps: ['Swing easy'], defaultMinutes: 5 });
		expect((await call(createDrill, 'coach_a', { name: 'gate warm-up' })).status).toBe(409);

		const patched = await call(updateDrill, 'coach_a', { purpose: 'Get loose', steps: ['Swing easy', 'Hold the finish'] }, { id: made.body.id });
		expect(patched.body).toMatchObject({ name: 'Gate Warm-up', purpose: 'Get loose', steps: ['Swing easy', 'Hold the finish'], defaultMinutes: 5 });
		expect((await call(updateDrill, 'coach_a', { name: 'Start Line Gate' }, { id: made.body.id })).status).toBe(409);
		expect((await call(updateDrill, 'coach_a', { purpose: 'x' }, { id: '00000000-0000-4000-8000-0000000000ff' })).status).toBe(404);
		expect((await call(getDrill, 'coach_a', undefined, { id: 'nope' })).status).toBe(404);
		expect((await call(createDrill, 'coach_a', { name: '' })).status).toBe(422);
	});
});

describe('plans', () => {
	it.each([30, 45, 60, 90])('saves a %i minute session whose drills add up exactly', async (len) => {
		const [a, b] = await seeded();
		const body = { title: `Plan ${len}`, structure: { v: 1, sessions: [session('Day 1', len, [{ drillId: a!.id, minutes: len - 10 }, { drillId: b!.id, minutes: 10 }])] } };
		const r = await call(createPlan, 'coach_a', body);
		expect(r.status).toBe(200);
		expect(r.body.structure.sessions[0].durationMin).toBe(len);
		expect((await call(getPlan, 'coach_a', undefined, { id: r.body.id })).body.title).toBe(`Plan ${len}`);
	});

	it('rejects sessions that do not add up, naming the session', async () => {
		const [a] = await seeded();
		const r = await call(createPlan, 'coach_a', { title: 'Bad', structure: { v: 1, sessions: [session('Short day', 45, [{ drillId: a!.id, minutes: 40 }])] } });
		expect(r.status).toBe(422);
		expect(r.body.message).toContain('"Short day" is 40 min, needs 45');
	});

	it('rejects unsupported lengths and unknown drills', async () => {
		const [a] = await seeded();
		expect((await call(createPlan, 'coach_a', { title: 'Odd', structure: { v: 1, sessions: [session('d', 50, [{ drillId: a!.id, minutes: 50 }])] } })).status).toBe(422);
		const ghost = '00000000-0000-4000-8000-0000000000ee';
		expect((await call(createPlan, 'coach_a', { title: 'Ghost', structure: { v: 1, sessions: [session('d', 30, [{ drillId: ghost, minutes: 30 }])] } })).status).toBe(422);
	});

	it('updates title and structure, re-checking totals; lists newest first', async () => {
		const [a, b] = await seeded();
		const made = await call(createPlan, 'coach_a', { title: 'Editable', structure: { v: 1, sessions: [session('d', 30, [{ drillId: a!.id, minutes: 30 }])] } });
		const id = made.body.id;
		const renamed = await call(updatePlan, 'coach_a', { title: 'Renamed' }, { id });
		expect(renamed.body).toMatchObject({ title: 'Renamed' });
		expect(renamed.body.structure.sessions[0].items).toHaveLength(1);

		const bad = await call(updatePlan, 'coach_a', { structure: { v: 1, sessions: [session('d', 30, [{ drillId: b!.id, minutes: 5 }])] } }, { id });
		expect(bad.status).toBe(422);
		expect((await call(getPlan, 'coach_a', undefined, { id })).body.structure.sessions[0].items[0].minutes).toBe(30);

		const good = await call(updatePlan, 'coach_a', { structure: { v: 1, sessions: [session('d', 60, [{ drillId: b!.id, minutes: 60 }])] } }, { id });
		expect(good.body.structure.sessions[0].durationMin).toBe(60);

		expect((await call(updatePlan, 'coach_a', { title: 'x' }, { id: '00000000-0000-4000-8000-0000000000dd' })).status).toBe(404);
		const list = (await call(listPlans, 'coach_a')).body.plans as { id: string }[];
		expect(list.length).toBeGreaterThanOrEqual(5);
		expect(list.some((p) => p.id === id)).toBe(true);
	});
});

const pair = (coachClerk: string, playerClerk: string) =>
	rt.runPromise(
		Effect.gen(function* () {
			const users = yield* Users;
			const db = yield* Db;
			const c = yield* users.ensure({ clerkUserId: coachClerk, role: 'coach' });
			const p = yield* users.ensure({ clerkUserId: playerClerk, role: 'player' });
			yield* db.query(`insert into coach_assignments (coach_id, player_id, status) values ($1, $2, 'active') on conflict do nothing`, [c.id, p.id]);
			return p.id;
		})
	);
const userId = (clerk: string) => rt.runPromise(Effect.gen(function* () { return (yield* (yield* Users).ensure({ clerkUserId: clerk, role: 'player' })).id; }));

describe('assigning a plan', () => {
	const makePlan = async () => {
		const [a, b] = await seeded();
		const r = await call(createPlan, 'coach_a', {
			title: 'Three sessions',
			structure: {
				v: 1,
				sessions: [
					session('Start line', 30, [{ drillId: a!.id, minutes: 20 }, { drillId: b!.id, minutes: 10 }]),
					session('Contact', 45, [{ drillId: b!.id, minutes: 45 }]),
					session('Mix', 60, [{ drillId: a!.id, minutes: 60 }])
				]
			}
		});
		return { planId: r.body.id as string, drillA: a!, drillB: b! };
	};

	it('creates the assignment, dated sessions with copied items, and notifies the player', async () => {
		const playerId = await pair('coach_a', 'pl_assign');
		const { planId, drillA } = await makePlan();
		const r = await call(assignPlan, 'coach_a', { playerId, startsOn: '2026-02-27', spacingDays: 2 }, { id: planId });
		expect(r.status).toBe(200);
		expect(r.body).toMatchObject({ planId, playerId, startsOn: '2026-02-27', status: 'active' });
		expect(r.body.sessions.map((s: any) => [s.scheduledOn, s.title, s.durationMin])).toEqual([
			['2026-02-27', 'Start line', 30],
			['2026-03-01', 'Contact', 45], // crosses the month end, 2026 is not a leap year
			['2026-03-03', 'Mix', 60]
		]);
		const first = r.body.sessions[0];
		expect(first.items).toHaveLength(2);
		expect(first.items[0]).toMatchObject({ drillId: drillA.id, name: drillA.name, minutes: 20, completedAt: null });
		expect(first.items[0].id).toMatch(/^[0-9a-f-]{36}$/);

		const notes = await rt.runPromise(Effect.gen(function* () { return yield* (yield* Db).query<{ type: string; payload: any }>(`select type, payload from notifications where user_id = $1`, [playerId]); }));
		expect(notes).toHaveLength(1);
		expect(notes[0]).toMatchObject({ type: 'plan_assigned', payload: { assignmentId: r.body.id, planTitle: 'Three sessions', startsOn: '2026-02-27' } });
	});

	it('defaults to one session per day', async () => {
		const playerId = await pair('coach_a', 'pl_daily');
		const { planId } = await makePlan();
		const r = await call(assignPlan, 'coach_a', { playerId, startsOn: '2026-05-01' }, { id: planId });
		expect(r.body.sessions.map((s: any) => s.scheduledOn)).toEqual(['2026-05-01', '2026-05-02', '2026-05-03']);
	});

	it('a later plan edit does not change what was assigned', async () => {
		const playerId = await pair('coach_a', 'pl_frozen');
		const { planId, drillB } = await makePlan();
		const r = await call(assignPlan, 'coach_a', { playerId, startsOn: '2026-05-01' }, { id: planId });
		await call(updatePlan, 'coach_a', { structure: { v: 1, sessions: [session('Only', 30, [{ drillId: drillB.id, minutes: 30 }])] } }, { id: planId });
		const rows = await rt.runPromise(Effect.gen(function* () { return yield* (yield* Db).query(`select 1 from plan_sessions where assignment_id = $1`, [r.body.id]); }));
		expect(rows).toHaveLength(3);
	});

	it('refuses a player the coach is not paired with, and writes nothing', async () => {
		const stranger = await userId('pl_stranger');
		const { planId } = await makePlan();
		const r = await call(assignPlan, 'coach_a', { playerId: stranger, startsOn: '2026-05-01' }, { id: planId });
		expect(r.status).toBe(403);
		const n = await rt.runPromise(Effect.gen(function* () { return yield* (yield* Db).query(`select 1 from plan_assignments where player_id = $1`, [stranger]); }));
		expect(n).toHaveLength(0);
	});

	it('players cannot assign (403); unknown plan 404; bad dates and ids 422', async () => {
		const playerId = await pair('coach_a', 'pl_misc');
		const { planId } = await makePlan();
		expect((await call(assignPlan, 'pl_misc', { playerId, startsOn: '2026-05-01' }, { id: planId })).status).toBe(403);
		expect((await call(assignPlan, null, { playerId, startsOn: '2026-05-01' }, { id: planId })).status).toBe(401);
		expect((await call(assignPlan, 'coach_a', { playerId, startsOn: '2026-05-01' }, { id: '00000000-0000-4000-8000-0000000000cc' })).status).toBe(404);
		expect((await call(assignPlan, 'coach_a', { playerId, startsOn: '2026-02-30' }, { id: planId })).status).toBe(422);
		expect((await call(assignPlan, 'coach_a', { playerId, startsOn: 'tomorrow' }, { id: planId })).status).toBe(422);
		expect((await call(assignPlan, 'coach_a', { playerId: 'x', startsOn: '2026-05-01' }, { id: planId })).status).toBe(422);
		expect((await call(assignPlan, 'coach_a', { playerId, startsOn: '2026-05-01', spacingDays: 0 }, { id: planId })).status).toBe(422);
	});
});

describe('a player working through a plan', () => {
	const setup = async (clerk: string) => {
		const [a, b] = await seeded();
		const playerId = await pair('coach_a', clerk);
		const plan = await call(createPlan, 'coach_a', {
			title: 'Weekend',
			structure: { v: 1, sessions: [session('Saturday', 30, [{ drillId: a!.id, minutes: 20 }, { drillId: b!.id, minutes: 10 }]), session('Sunday', 30, [{ drillId: b!.id, minutes: 30 }])] }
		});
		await call(assignPlan, 'coach_a', { playerId, startsOn: '2026-06-06' }, { id: plan.body.id });
		const mine = await call(listMySessions, clerk);
		return { playerId, a: a!, b: b!, sessions: mine.body.sessions as any[] };
	};
	const check = (clerk: string | null, sessionId: string, itemId: string, completed: boolean) =>
		call(setSessionItemCompleted, clerk, { completed }, { id: sessionId, itemId });

	it('lists only their own sessions, by date, with the plan title', async () => {
		const { sessions } = await setup('pl_list');
		expect(sessions.map((s) => [s.scheduledOn, s.title, s.planTitle])).toEqual([
			['2026-06-06', 'Saturday', 'Weekend'],
			['2026-06-07', 'Sunday', 'Weekend']
		]);
		expect((await call(listMySessions, 'pl_nobody')).body.sessions).toEqual([]);
		expect((await call(listMySessions, 'coach_a')).status).toBe(403);
		expect((await call(listMySessions, null)).status).toBe(401);
	});

	it('stores completion with a timestamp, finishes the session when every drill is done, and can undo', async () => {
		const { sessions } = await setup('pl_done');
		const sat = sessions[0];
		const one = await check('pl_done', sat.id, sat.items[0].id, true);
		expect(one.status).toBe(200);
		expect(one.body.items[0].completedAt).not.toBeNull();
		expect(one.body.items[1].completedAt).toBeNull();
		expect(one.body.completedAt).toBeNull();

		const two = await check('pl_done', sat.id, sat.items[1].id, true);
		expect(two.body.completedAt).not.toBeNull();
		// The first check-off keeps its original time when re-sent.
		expect((await check('pl_done', sat.id, sat.items[0].id, true)).body.items[0].completedAt).toBe(one.body.items[0].completedAt);

		const undone = await check('pl_done', sat.id, sat.items[1].id, false);
		expect(undone.body.items[1].completedAt).toBeNull();
		expect(undone.body.completedAt).toBeNull();
		const reread = (await call(listMySessions, 'pl_done')).body.sessions[0];
		expect(reread.items[0].completedAt).not.toBeNull();
		expect(reread.items[1].completedAt).toBeNull();
	});

	it('cannot touch another player\'s session or an unknown drill (404); coaches and anonymous are refused', async () => {
		const { sessions } = await setup('pl_owner');
		const sat = sessions[0];
		await pair('coach_a', 'pl_other');
		expect((await check('pl_other', sat.id, sat.items[0].id, true)).status).toBe(404);
		expect((await check('pl_owner', sat.id, '00000000-0000-4000-8000-0000000000aa', true)).status).toBe(404);
		expect((await check('pl_owner', 'nope', sat.items[0].id, true)).status).toBe(404);
		expect((await check('coach_a', sat.id, sat.items[0].id, true)).status).toBe(403);
		expect((await check(null, sat.id, sat.items[0].id, true)).status).toBe(401);
		expect((await call(setSessionItemCompleted, 'pl_owner', { completed: 'yes' }, { id: sat.id, itemId: sat.items[0].id })).status).toBe(422);
		expect((await call(listMySessions, 'pl_owner')).body.sessions[0].items[0].completedAt).toBeNull();
	});

	it('lets a player read the drills in their sessions, and no others', async () => {
		const { a, sessions } = await setup('pl_drills');
		const assigned = sessions[0].items[0].drillId as string;
		expect(assigned).toBe(a.id);
		const ok = await call(getDrill, 'pl_drills', undefined, { id: assigned });
		expect(ok.status).toBe(200);
		expect(ok.body.steps.length).toBeGreaterThan(0);
		const others = (await seeded()).filter((d) => !sessions.some((s) => s.items.some((i: any) => i.drillId === d.id)));
		expect(others.length).toBeGreaterThan(0);
		expect((await call(getDrill, 'pl_drills', undefined, { id: others[0]!.id })).status).toBe(403);
	});
});

describe('phases and Home', () => {
	const phase = (id: string, fromLesson: number, toLesson: number) => ({ id, title: `Phase ${id}`, description: 'Why it matters', measure: '7 of 10', fromLesson, toLesson });
	const mk = async (phases?: unknown) => {
		const [a] = await seeded();
		const sessions = [1, 2, 3, 4].map((n) => session(`Lesson ${n}`, 30, [{ drillId: a!.id, minutes: 30 }]));
		return call(createPlan, 'coach_a', { title: 'Roadmap', structure: { v: 1, sessions, ...(phases === undefined ? {} : { phases }) } });
	};
	const home = (clerk: string | null, today: string) => call(homeDataFor(today), clerk);

	it('round-trips phases through create, get and update; plans without phases return []', async () => {
		const made = await mk([phase('a', 1, 2), phase('b', 3, 4)]);
		expect(made.status).toBe(200);
		expect(made.body.structure.phases).toHaveLength(2);
		expect((await call(getPlan, 'coach_a', undefined, { id: made.body.id })).body.structure.phases[1]).toMatchObject({ id: 'b', fromLesson: 3, measure: '7 of 10' });
		const none = await mk();
		expect(none.body.structure.phases).toEqual([]);

		// Editing the sessions without sending phases keeps them.
		const [a] = await seeded();
		const kept = await call(updatePlan, 'coach_a', { structure: { v: 1, sessions: [1, 2, 3, 4].map((n) => session(`New ${n}`, 30, [{ drillId: a!.id, minutes: 30 }])) } }, { id: made.body.id });
		expect(kept.body.structure.phases).toHaveLength(2);
		// Sending an empty array clears them.
		const cleared = await call(updatePlan, 'coach_a', { structure: { v: 1, sessions: kept.body.structure.sessions, phases: [] } }, { id: made.body.id });
		expect(cleared.body.structure.phases).toEqual([]);
	});

	it('rejects overlapping, reversed and out-of-range phases with 422', async () => {
		expect((await mk([phase('a', 1, 3), phase('b', 3, 4)])).status).toBe(422);
		expect((await mk([phase('a', 3, 2)])).status).toBe(422);
		expect((await mk([phase('a', 1, 9)])).status).toBe(422);
		const ok = await mk([phase('a', 1, 2)]);
		const bad = await call(updatePlan, 'coach_a', { structure: { v: 1, sessions: ok.body.structure.sessions, phases: [phase('x', 2, 2), phase('y', 1, 1)] } }, { id: ok.body.id });
		expect(bad.status).toBe(422);
	});

	it('gives a player with no plan an empty Home, and a coach 403', async () => {
		const r = await home('pl_home_none', '2026-07-01');
		expect(r.status).toBe(200);
		expect(r.body).toMatchObject({ assignment: null, lesson: null, phases: [], currentPhaseId: null });
		expect((await home('coach_a', '2026-07-01')).status).toBe(403);
		expect((await home(null, '2026-07-01')).status).toBe(401);
	});

	it('numbers lessons, picks the current one and derives phase state from the assigned plan', async () => {
		const playerId = await pair('coach_a', 'pl_home');
		const made = await mk([phase('a', 1, 2), phase('b', 3, 4)]);
		await call(assignPlan, 'coach_a', { playerId, startsOn: '2026-07-01', spacingDays: 2 }, { id: made.body.id });
		// Lessons on 07-01, 07-03, 07-05, 07-07.
		let h = (await home('pl_home', '2026-07-03')).body;
		expect(h.assignment).toMatchObject({ planTitle: 'Roadmap', startsOn: '2026-07-01' });
		expect(h.lesson).toMatchObject({ number: 2, total: 4, completedCount: 0, isToday: true });
		expect(h.lesson.session.title).toBe('Lesson 2');
		expect(h.phases.map((p: any) => p.state)).toEqual(['current', 'upcoming']);

		h = (await home('pl_home', '2026-07-04')).body; // between lessons: next upcoming
		expect(h.lesson).toMatchObject({ number: 3, isToday: false });
		expect(h.currentPhaseId).toBe('b');
		expect(h.phases.map((p: any) => p.state)).toEqual(['done', 'current']);

		// Finish every drill of every lesson: nothing left, all phases done.
		const sessions = (await call(listMySessions, 'pl_home')).body.sessions as any[];
		for (const s of sessions) for (const i of s.items) await call(setSessionItemCompleted, 'pl_home', { completed: true }, { id: s.id, itemId: i.id });
		h = (await home('pl_home', '2026-07-10')).body;
		expect(h.lesson).toBeNull();
		expect(h.assignment).not.toBeNull();
		expect(h.phases.map((p: any) => p.state)).toEqual(['done', 'done']);
		expect(h.currentPhaseId).toBeNull();
	});

	it('gives the /plans page phases and a lesson number per session', async () => {
		const playerId = await pair('coach_a', 'pl_plans_page');
		const made = await mk([phase('a', 1, 2), phase('b', 3, 4)]);
		await call(assignPlan, 'coach_a', { playerId, startsOn: '2026-07-01' }, { id: made.body.id });
		const r = await call(plansPageData, 'pl_plans_page');
		expect(r.status).toBe(200);
		expect(r.body.phases.map((p: any) => p.id)).toEqual(['a', 'b']);
		const byTitle = Object.fromEntries(r.body.sessions.map((s: any) => [s.title, r.body.lessonBySession[s.id]]));
		expect(byTitle).toEqual({ 'Lesson 1': 1, 'Lesson 2': 2, 'Lesson 3': 3, 'Lesson 4': 4 });
		expect((await call(plansPageData, 'coach_a')).status).toBe(403);
		expect((await call(plansPageData, 'pl_home_none')).body).toEqual({ sessions: [], phases: [], lessonBySession: {} });
	});

	it('uses the active assignment with the latest start date', async () => {
		const playerId = await pair('coach_a', 'pl_home_two');
		const first = await mk([phase('a', 1, 4)]);
		const second = await mk([phase('z', 1, 4)]);
		await call(assignPlan, 'coach_a', { playerId, startsOn: '2026-08-01' }, { id: second.body.id });
		await call(assignPlan, 'coach_a', { playerId, startsOn: '2026-07-01' }, { id: first.body.id });
		const h = (await home('pl_home_two', '2026-08-01')).body;
		expect(h.assignment.startsOn).toBe('2026-08-01');
		expect(h.phases[0].id).toBe('z');
	});
});
