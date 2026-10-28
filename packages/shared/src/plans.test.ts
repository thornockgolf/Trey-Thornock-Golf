import { Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import { PlanStructure, SESSION_LENGTHS, addDays, buildHome, drillIdsOf, phaseIssues, sessionTotalIssues } from './plans';

describe('addDays', () => {
	it('adds whole days across month, year and leap boundaries', () => {
		expect(addDays('2026-02-27', 2)).toBe('2026-03-01');
		expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
		expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
		expect(addDays('2026-05-01', 0)).toBe('2026-05-01');
	});
	it('returns null for impossible or malformed dates', () => {
		expect(addDays('2026-02-30', 1)).toBeNull();
		expect(addDays('2026-13-01', 1)).toBeNull();
		expect(addDays('tomorrow', 1)).toBeNull();
	});
});

const A = '00000000-0000-4000-8000-00000000000a';
const B = '00000000-0000-4000-8000-00000000000b';

const decode = (v: unknown) => Schema.decodeUnknownExit(PlanStructure)(v);
const plan = (durationMin: number, items: { drillId: string; minutes: number }[]) => ({ v: 1, sessions: [{ title: 'Day 1', durationMin, items }] });

describe('session totals', () => {
	it.each(SESSION_LENGTHS)('accepts drill minutes that sum to exactly %i', (len) => {
		const structure = plan(len, [
			{ drillId: A, minutes: len - 10 },
			{ drillId: B, minutes: 10 }
		]);
		const decoded = decode(structure);
		expect(decoded._tag).toBe('Success');
		expect(sessionTotalIssues(structure as PlanStructure)).toEqual([]);
	});

	it('reports a session that is over or under', () => {
		const over = plan(30, [{ drillId: A, minutes: 31 }]) as PlanStructure;
		expect(sessionTotalIssues(over)).toEqual([{ index: 0, title: 'Day 1', expected: 30, actual: 31 }]);
		const under = plan(60, [{ drillId: A, minutes: 59 }]) as PlanStructure;
		expect(sessionTotalIssues(under)[0]).toMatchObject({ expected: 60, actual: 59 });
	});
});

describe('plan structure schema', () => {
	it('only allows 30, 45, 60 and 90 minute sessions', () => {
		expect(decode(plan(50, [{ drillId: A, minutes: 50 }]))._tag).toBe('Failure');
	});
	it('rejects empty plans and sessions, non-uuid drill ids and fractional minutes', () => {
		expect(decode({ v: 1, sessions: [] })._tag).toBe('Failure');
		expect(decode(plan(30, []))._tag).toBe('Failure');
		expect(decode(plan(30, [{ drillId: 'x', minutes: 30 }]))._tag).toBe('Failure');
		expect(decode(plan(30, [{ drillId: A, minutes: 29.5 }]))._tag).toBe('Failure');
	});
	it('lists each drill once', () => {
		const s = { v: 1, sessions: [plan(30, [{ drillId: A, minutes: 30 }]).sessions[0], plan(30, [{ drillId: A, minutes: 20 }, { drillId: B, minutes: 10 }]).sessions[0]] } as PlanStructure;
		expect(drillIdsOf(s).sort()).toEqual([A, B]);
	});
});

describe('phases', () => {
	const sessions = Array.from({ length: 6 }, (_, i) => ({ title: `L${i + 1}`, durationMin: 30, items: [{ drillId: A, minutes: 30 }] }));
	const ph = (id: string, fromLesson: number, toLesson: number) => ({ id, title: `Phase ${id}`, description: 'why', fromLesson, toLesson });
	const parse = (phases?: unknown) => Schema.decodeUnknownSync(PlanStructure)({ v: 1, sessions, ...(phases === undefined ? {} : { phases }) });

	it('accepts no phases, or ordered non-overlapping ones', () => {
		expect(phaseIssues(parse())).toEqual([]);
		expect(phaseIssues(parse([ph('a', 1, 2), ph('b', 3, 3), ph('c', 5, 6)]))).toEqual([]);
	});
	it('flags overlap, bad order, reversed and out-of-range phases', () => {
		expect(phaseIssues(parse([ph('a', 1, 3), ph('b', 3, 4)]))).toHaveLength(1);
		expect(phaseIssues(parse([ph('a', 4, 5), ph('b', 1, 2)]))).toHaveLength(1);
		expect(phaseIssues(parse([ph('a', 3, 2)]))[0]).toContain('starts after');
		expect(phaseIssues(parse([ph('a', 5, 9)]))[0]).toContain('past lesson 6');
		expect(phaseIssues(parse([ph('a', 1, 2), ph('a', 3, 4)]))[0]).toContain('repeats an id');
	});
	it('rejects malformed phases at decode', () => {
		expect(() => parse([ph('a', 0, 2)])).toThrow();
		expect(() => parse([ph('a', 1.5, 2)])).toThrow();
		expect(() => parse([{ ...ph('a', 1, 2), title: '' }])).toThrow();
		expect(() => parse(Array.from({ length: 13 }, (_, i) => ph(`p${i}`, i + 1, i + 1)))).toThrow();
	});
});

describe('buildHome', () => {
	const sess = (n: number, scheduledOn: string, done = false) => ({
		id: `s${n}`, assignmentId: 'a', title: `L${n}`, planTitle: 'Plan', scheduledOn, durationMin: 30, items: [], completedAt: done ? '2026-01-01T00:00:00Z' : null
	});
	const phases = [
		{ id: 'p1', title: 'One', description: 'd', fromLesson: 1, toLesson: 2 },
		{ id: 'p2', title: 'Two', description: 'd', fromLesson: 3, toLesson: 4 }
	];
	const assignment = { id: 'a', planTitle: 'Plan', startsOn: '2026-05-01' };
	const days = [sess(1, '2026-05-01', true), sess(2, '2026-05-03'), sess(3, '2026-05-05'), sess(4, '2026-05-07')];
	const home = (today: string, s = days) => buildHome({ assignment, sessions: s, phases }, today);

	it('is empty without an assignment', () => {
		expect(buildHome({ assignment: null, sessions: [], phases: [] }, '2026-05-01')).toMatchObject({ assignment: null, lesson: null, phases: [], currentPhaseId: null });
	});
	it('picks today, numbering by position', () => {
		const h = home('2026-05-05');
		expect(h.lesson).toMatchObject({ number: 3, total: 4, completedCount: 1, isToday: true });
		expect(h.phases.map((p) => p.state)).toEqual(['done', 'current']);
		expect(h.currentPhaseId).toBe('p2');
	});
	it('falls to the next upcoming uncompleted session', () => {
		const h = home('2026-05-04');
		expect(h.lesson).toMatchObject({ number: 3, isToday: false });
	});
	it('falls back to the earliest overdue uncompleted session', () => {
		const h = home('2026-06-01');
		expect(h.lesson).toMatchObject({ number: 2, isToday: false });
		expect(h.currentPhaseId).toBe('p1');
		expect(h.phases.map((p) => p.state)).toEqual(['current', 'upcoming']);
	});
	it('is finished when everything is complete: no lesson, all phases done', () => {
		const h = home('2026-06-01', days.map((d) => ({ ...d, completedAt: '2026-01-01T00:00:00Z' })));
		expect(h.lesson).toBeNull();
		expect(h.assignment).not.toBeNull();
		expect(h.phases.map((p) => p.state)).toEqual(['done', 'done']);
		expect(h.currentPhaseId).toBeNull();
	});
	it('treats the next phase as current when a lesson falls in a gap', () => {
		const gap = [{ id: 'p1', title: 'One', description: 'd', fromLesson: 1, toLesson: 1 }, { id: 'p2', title: 'Two', description: 'd', fromLesson: 3, toLesson: 4 }];
		const h = buildHome({ assignment, sessions: days, phases: gap }, '2026-05-03');
		expect(h.lesson?.number).toBe(2);
		expect(h.phases.map((p) => p.state)).toEqual(['done', 'current']);
	});
});
