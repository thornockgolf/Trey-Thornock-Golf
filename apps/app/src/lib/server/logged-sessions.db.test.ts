import { Billing, Coaching, Drills, Favorites, LoggedSessions, Plans, Users, Videos } from '@ttg/db';
import { TestDb } from '@ttg/db/testing';
import { addDays, keys } from '@ttg/shared';
import { Effect, Layer, ManagedRuntime } from 'effect';
import { afterAll, describe, expect, it } from 'vitest';
import { CoachAllowlist } from './auth';
import { getCalendar } from './calendar';
import { createLoggedSession, deleteLoggedSession, editPageData, listLoggedSessions, logPageData, updateLoggedSession } from './logged-sessions';
import { assignPlan, createPlan, homeDataFor, listDrills, plansPageData, setSessionItemCompleted } from './plans';
import { playerDetailData } from './players';
import { makeRunRoute } from './run-route';
import { autoPay, fakeEvent } from './test-utils';
import { CheckIns, Assessments, Questionnaires, Profiles } from '@ttg/db';

// Integration: logged (extra) sessions on a real database.
const Services = Layer.mergeAll(
	Users.layer, Videos.layer, Coaching.layer, Plans.layer, Drills.layer, Billing.layer, LoggedSessions.layer, Favorites.layer, CheckIns.layer, Assessments.layer, Questionnaires.layer, Profiles.layer
).pipe(Layer.provideMerge(TestDb));
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
const today = new Date().toISOString().slice(0, 10);
const video = (n: number, ownerId: string) => {
	const id = `00000000-0000-4000-8000-0000000d1d${String(n).padStart(2, '0')}`;
	return rt.runPromise(Effect.flatMap(Videos, (v) => v.create({ id, ownerId, kind: 'swing', sourceKey: keys.rawSource(id, 'mp4'), sizeBytes: 1 }))).then(() => id);
};

describe('logging a session', () => {
	it('a player logs with tags, minutes, text, notes and a drill; it reads back newest first', async () => {
		await pair('coach_a', 'pl_lg1');
		const drills = (await call(listDrills, 'coach_a')).body.drills as { id: string; name: string }[];
		const made = await call(createLoggedSession, 'pl_lg1', {
			body: { date: today, tags: ['skill', 'mechanical'], minutes: 40, workedOn: '  Wedges to 60 yards ', notes: 'Felt good', drillIds: [drills[0]!.id] }
		});
		expect(made.status).toBe(200);
		expect(made.body).toMatchObject({ date: today, tags: ['mechanical', 'skill'], minutes: 40, workedOn: 'Wedges to 60 yards', notes: 'Felt good', video: null });
		expect(made.body.drills).toEqual([{ id: drills[0]!.id, name: drills[0]!.name }]);
		await call(createLoggedSession, 'pl_lg1', { body: { date: addDays(today, -3), tags: ['situational'] } });
		const list = await call(listLoggedSessions, 'pl_lg1');
		expect(list.body.sessions.map((s: any) => s.date)).toEqual([today, addDays(today, -3)]);
	});

	it('works for a player with no plan, and needs no payment beyond signing in', async () => {
		const res = await call(createLoggedSession, 'pl_noplan', { body: { date: today, workedOn: 'Putting' } });
		expect(res.status).toBe(200);
		expect(res.body.tags).toEqual([]);
	});

	it('the exact bodies the form sends work for an unpaid player with no profile and no plan (date + one tag; date + text)', async () => {
		// run0 skips the auto-payment: this player never paid, answered nothing and has no plan
		const send = async (body: unknown) => (await run0(fakeEvent({ userId: 'pl_unpaid', body }), createLoggedSession as never)).status;
		expect(await send({ date: today, tags: ['skill'] })).toBe(200);
		expect(await send({ date: today, workedOn: 'Putting' })).toBe(200);
	});

	it('refuses empty logs, future and absurd dates, long notes, unknown tags, unknown drills', async () => {
		const bad = async (body: unknown) => (await call(createLoggedSession, 'pl_lg2', { body })).status;
		const empty = await call(createLoggedSession, 'pl_lg2', { body: { date: today, tags: [], workedOn: '  ', notes: '' } });
		expect(empty.status).toBe(422);
		expect(empty.body.message).toContain('Pick at least one');
		expect(await bad({ date: addDays(today, 3), tags: ['skill'] })).toBe(422);
		expect((await call(createLoggedSession, 'pl_lg2', { body: { date: addDays(today, 3), tags: ['skill'] } })).body.message).toContain('future');
		expect(await bad({ date: addDays(today, -400), tags: ['skill'] })).toBe(422);
		expect(await bad({ date: '2026-02-30', tags: ['skill'] })).toBe(422);
		expect(await bad({ date: today, notes: 'x'.repeat(2001) })).toBe(422);
		expect(await bad({ date: today, tags: ['putting'] })).toBe(422);
		expect(await bad({ date: today, tags: ['skill'], minutes: 0 })).toBe(422);
		expect(await bad({ date: today, tags: ['skill'], drillIds: ['00000000-0000-4000-8000-0000000000ee'] })).toBe(422);
		expect(await bad({ date: today, tags: ['skill'], videoId: 'nope' })).toBe(422);
		// tomorrow in UTC is allowed (the player may be ahead of UTC)
		expect(await bad({ date: addDays(today, 1), tags: ['skill'] })).toBe(200);
	});

	it('only players write; coaches and anonymous callers cannot', async () => {
		await pair('coach_a', 'pl_lg3');
		const body = { date: today, tags: ['skill'] };
		expect((await call(createLoggedSession, 'coach_a', { body })).status).toBe(403);
		expect((await call(createLoggedSession, null, { body })).status).toBe(401);
		expect((await call(updateLoggedSession, 'coach_a', { body: { minutes: 5 }, params: { id: '00000000-0000-4000-8000-0000000000aa' } })).status).toBe(403);
		expect((await call(deleteLoggedSession, 'coach_a', { params: { id: '00000000-0000-4000-8000-0000000000aa' } })).status).toBe(403);
	});
});

describe('editing, video and deleting', () => {
	it('edits own logs only, keeps a log non-empty, and attaches, shows state of and detaches a video', async () => {
		const { p } = await pair('coach_a', 'pl_ed1');
		const other = await u('pl_ed2');
		const made = await call(createLoggedSession, 'pl_ed1', { body: { date: today, tags: ['skill'], minutes: 30 } });
		const id = made.body.id;
		expect((await call(updateLoggedSession, 'pl_ed2', { params: { id }, body: { minutes: 1 } })).status).toBe(404);
		expect((await call(deleteLoggedSession, 'pl_ed2', { params: { id } })).status).toBe(404);

		const edited = await call(updateLoggedSession, 'pl_ed1', { params: { id }, body: { minutes: null, notes: 'Added later', tags: ['skill', 'situational'] } });
		expect(edited.body).toMatchObject({ minutes: null, notes: 'Added later', tags: ['skill', 'situational'] });
		expect((await call(updateLoggedSession, 'pl_ed1', { params: { id }, body: { tags: [], notes: null } })).status).toBe(422);
		expect((await call(updateLoggedSession, 'pl_ed1', { params: { id }, body: { date: addDays(today, 5) } })).status).toBe(422);

		// the video: someone else's is refused; their own is attached later and shows its processing state
		const theirs = await video(1, other.id);
		expect((await call(updateLoggedSession, 'pl_ed1', { params: { id }, body: { videoId: theirs } })).status).toBe(422);
		const mine = await video(2, p.id);
		const withVideo = await call(updateLoggedSession, 'pl_ed1', { params: { id }, body: { videoId: mine } });
		expect(withVideo.body.video).toMatchObject({ id: mine, status: 'pending' });
		const detached = await call(updateLoggedSession, 'pl_ed1', { params: { id }, body: { videoId: null } });
		expect(detached.body.video).toBeNull();
		await call(updateLoggedSession, 'pl_ed1', { params: { id }, body: { videoId: mine } });

		// deleting the log leaves the video in the library
		expect((await call(deleteLoggedSession, 'pl_ed1', { params: { id } })).status).toBe(200);
		expect((await call(deleteLoggedSession, 'pl_ed1', { params: { id } })).status).toBe(404);
		expect(await rt.runPromise(Effect.flatMap(Videos, (v) => v.find(mine)))).toBeTruthy();
	});

	it('loads the edit page data for the owner only', async () => {
		await pair('coach_a', 'pl_ed3');
		await u('pl_ed4');
		const made = await call(createLoggedSession, 'pl_ed3', { body: { date: today, tags: ['skill'] } });
		const ok = await call(editPageData, 'pl_ed3', { params: { id: made.body.id } });
		expect(ok.status).toBe(200);
		expect(ok.body.session.id).toBe(made.body.id);
		expect(Array.isArray(ok.body.drills)).toBe(true);
		expect((await call(editPageData, 'pl_ed4', { params: { id: made.body.id } })).status).toBe(404);
		expect((await call(logPageData, 'pl_ed3')).body.drills.length).toBeGreaterThan(0);
	});
});

describe('coach view and calendar', () => {
	it('a coach reads their own players\' logs, not others\', and the calendar API carries them', async () => {
		await pair('coach_a', 'pl_cv1');
		const { p } = await pair('coach_a', 'pl_cv2');
		await u('coach_b', 'coach');
		await call(createLoggedSession, 'pl_cv2', { body: { date: today, tags: ['mechanical'], notes: 'Grip work' } });
		const read = await call(listLoggedSessions, 'coach_a', { query: `?playerId=${p.id}` });
		expect(read.status).toBe(200);
		expect(read.body.sessions[0]).toMatchObject({ notes: 'Grip work', tags: ['mechanical'] });
		expect((await call(listLoggedSessions, 'coach_b', { query: `?playerId=${p.id}` })).status).toBe(403);
		expect((await call(listLoggedSessions, 'coach_a')).status).toBe(422);
		expect((await call(listLoggedSessions, 'pl_cv1')).body.sessions).toEqual([]);

		const cal = await call(getCalendar, 'pl_cv2');
		expect(cal.body.logged).toHaveLength(1);
		expect(cal.body.logged[0]).toMatchObject({ date: today, tags: ['mechanical'] });
		const coachCal = await call(getCalendar, 'coach_a', { query: `?playerId=${p.id}` });
		expect(coachCal.body.logged).toHaveLength(1);
		const detail = await call(playerDetailData, 'coach_a', { params: { id: p.id } });
		expect(detail.body.logged).toHaveLength(1);
		expect(detail.body.calendar.logged).toHaveLength(1);
	});
});

describe('progress rule: extras never advance the plan', () => {
	it('keeps Lesson N of M, completed counts and lesson numbers the same however much is logged; planned tags come from the plan', async () => {
		const { p } = await pair('coach_a', 'pl_pr1');
		const drills = (await call(listDrills, 'coach_a')).body.drills as { id: string }[];
		const s = (title: string, tags: string[]) => ({ title, durationMin: 30, tags, items: [{ drillId: drills[0]!.id, minutes: 30 }] });
		const plan = await call(createPlan, 'coach_a', {
			body: { title: 'Tagged', structure: { v: 1, sessions: [s('One', ['mechanical']), s('Two', ['mechanical', 'skill']), s('Three', ['mechanical', 'skill', 'situational'])] } }
		});
		expect(plan.status).toBe(200);
		await call(assignPlan, 'coach_a', { body: { playerId: p.id, startsOn: today }, params: { id: plan.body.id } });

		const before = (await call(homeDataFor(today), 'pl_pr1')).body;
		expect(before.lesson).toMatchObject({ number: 1, total: 3, completedCount: 0 });
		expect(before.lesson.session.tags).toEqual(['mechanical']);

		for (let i = 0; i < 4; i++) await call(createLoggedSession, 'pl_pr1', { body: { date: addDays(today, -i), tags: ['mechanical', 'skill', 'situational'], minutes: 60 } });

		const after = (await call(homeDataFor(today), 'pl_pr1')).body;
		expect(after.lesson).toMatchObject({ number: 1, total: 3, completedCount: 0 });
		const page = (await call(plansPageData, 'pl_pr1')).body;
		expect(page.sessions).toHaveLength(3);
		expect(Object.values(page.lessonBySession).sort()).toEqual([1, 2, 3]);
		expect(page.logged).toHaveLength(4);
		expect(page.sessions.map((x: any) => x.tags)).toEqual([['mechanical'], ['mechanical', 'skill'], ['mechanical', 'skill', 'situational']]);

		// finishing the planned lesson moves progress by exactly one; the extras still add nothing
		const first = page.sessions[0];
		await call(setSessionItemCompleted, 'pl_pr1', { body: { completed: true }, params: { id: first.id, itemId: first.items[0].id } });
		const done = (await call(homeDataFor(today), 'pl_pr1')).body;
		expect(done.lesson.completedCount).toBe(1);
		expect(done.lesson.total).toBe(3);
	});
});
