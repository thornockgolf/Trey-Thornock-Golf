import { Questionnaires, Users } from '@ttg/db';
import { TestDb } from '@ttg/db/testing';
import { Effect, Layer, ManagedRuntime } from 'effect';
import { afterAll, describe, expect, it } from 'vitest';
import { CoachAllowlist } from './auth';
import { getQuestionnaire, saveQuestionnaire } from './questionnaire';
import { makeRunRoute } from './run-route';
import { fakeEvent } from './test-utils';

// Integration: real Users/Questionnaires on a throwaway migrated database (needs `docker compose up -d db`).
const Services = Layer.mergeAll(Users.layer, Questionnaires.layer).pipe(Layer.provideMerge(TestDb));
const rt = ManagedRuntime.make(Layer.mergeAll(CoachAllowlist.layerFromCsv('coach_a'), Services));
const run = makeRunRoute(rt);
afterAll(() => rt.dispose());

const call = async (effect: Effect.Effect<any, any, any>, userId: string | null, body?: unknown) => {
	const res = await run(fakeEvent({ userId, body }), effect as never);
	return { status: res.status, body: (await res.json()) as any };
};
const save = (userId: string | null, answers: Record<string, unknown>, submit = false) => call(saveQuestionnaire, userId, { answers, submit });

const complete = {
	experience: '1to3',
	ballFlight: ['slice'],
	contact: ['solid'],
	missDriver: 'right',
	missIrons: 'right',
	missWedges: 'short',
	whenMiss: ['driver'],
	limitations: ['none'],
	goals: ['scores'],
	hoursPerWeek: '1to2'
};

describe('questionnaire API', () => {
	it('is player-only: coaches 403, anonymous 401', async () => {
		expect((await call(getQuestionnaire, 'coach_a')).status).toBe(403);
		expect((await save('coach_a', complete, true)).status).toBe(403);
		expect((await call(getQuestionnaire, null)).status).toBe(401);
	});

	it('serves the form with no draft for a new player', async () => {
		const r = await call(getQuestionnaire, 'pl_new');
		expect(r.status).toBe(200);
		expect(r.body.sections.length).toBeGreaterThan(0);
		expect(r.body).toMatchObject({ draft: null, latest: null });
	});

	it('resumes a saved draft, then completes it as attempt 1', async () => {
		const d = await save('pl_resume', { experience: '3to10' });
		expect(d.status).toBe(200);
		expect(d.body).toMatchObject({ version: 1, completedAt: null, answers: { experience: '3to10' } });

		const back = await call(getQuestionnaire, 'pl_resume');
		expect(back.body.draft.answers).toEqual({ experience: '3to10' });
		expect(back.body.latest).toBeNull();

		const done = await save('pl_resume', { ...complete, experience: '3to10' }, true);
		expect(done.status).toBe(200);
		expect(done.body.version).toBe(1);
		expect(done.body.completedAt).not.toBeNull();

		const after = await call(getQuestionnaire, 'pl_resume');
		expect(after.body.draft).toBeNull();
		expect(after.body.latest.id).toBe(done.body.id);
	});

	it('a submit with a required question missing names it and saves nothing', async () => {
		const { hoursPerWeek: _omit, ...partial } = complete;
		const r = await save('pl_invalid', partial, true);
		expect(r.status).toBe(422);
		expect(r.body.message).toContain('How much can you practice each week?');
		const after = await call(getQuestionnaire, 'pl_invalid');
		expect(after.body).toMatchObject({ draft: null, latest: null });
	});

	it('rejects unknown option values', async () => {
		expect((await save('pl_bad', { experience: 'forever' })).status).toBe(422);
	});

	it('a retake creates version 2 and keeps version 1', async () => {
		const first = await save('pl_retake', complete, true);
		expect(first.body.version).toBe(1);
		const second = await save('pl_retake', { ...complete, hoursPerWeek: '5plus' }, true);
		expect(second.body.version).toBe(2);
		expect(second.body.id).not.toBe(first.body.id);

		const rows = await rt.runPromise(
			Effect.gen(function* () {
				const users = yield* Users;
				const u = yield* users.findByClerkId('pl_retake');
				const q = yield* Questionnaires;
				return yield* q.getLatestCompleted(u!.id);
			})
		);
		expect(rows?.version).toBe(2);
		expect(rows?.values.hoursPerWeek).toBe('5plus');
	});

	it('a draft after a completed response starts a new attempt without touching the old one', async () => {
		const first = await save('pl_again', complete, true);
		const draft = await save('pl_again', { experience: '10plus' });
		expect(draft.body).toMatchObject({ version: 2, completedAt: null });
		const state = await call(getQuestionnaire, 'pl_again');
		expect(state.body.latest.id).toBe(first.body.id);
		expect(state.body.latest.answers.experience).toBe('1to3');
		expect(state.body.draft.answers.experience).toBe('10plus');
	});
});
