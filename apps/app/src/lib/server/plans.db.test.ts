import { Drills, Plans, Users } from '@ttg/db';
import { TestDb } from '@ttg/db/testing';
import { Effect, Layer, ManagedRuntime } from 'effect';
import { afterAll, describe, expect, it } from 'vitest';
import { CoachAllowlist } from './auth';
import { createDrill, createPlan, getDrill, getPlan, listDrills, listPlans, updateDrill, updatePlan } from './plans';
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
