import type { PlanSessionDto } from '@ttg/shared';
import { describe, expect, it } from 'vitest';
import { formatDay, formatRange, groupByPhase, favoriteDrillEntries, favoriteSessionList, groupSessions, isFinished, isPast, isMissed, localDate, progress, replaceSession, splitByDay, withItemCompleted } from './sessions';

const session = (id: string, scheduledOn: string, done: boolean[]): PlanSessionDto => ({
	id,
	assignmentId: 'a',
	title: id,
	planTitle: 'Plan',
	scheduledOn,
	durationMin: 30,
	items: done.map((d, n) => ({ id: `${id}-${n}`, drillId: `d${n}`, name: `Drill ${n}`, minutes: 10, completedAt: d ? '2026-06-06T10:00:00.000Z' : null })),
	completedAt: done.length > 0 && done.every(Boolean) ? '2026-06-06T10:00:00.000Z' : null
});

describe('groupSessions', () => {
	const all = [session('c', '2026-06-08', [false]), session('a', '2026-06-05', [true]), session('t', '2026-06-06', [false]), session('b', '2026-06-04', [false]), session('d', '2026-06-07', [false])];
	it('splits into today, upcoming (soonest first) and earlier (latest first)', () => {
		const g = groupSessions(all, '2026-06-06');
		expect(g.today.map((s) => s.id)).toEqual(['t']);
		expect(g.upcoming.map((s) => s.id)).toEqual(['d', 'c']);
		expect(g.earlier.map((s) => s.id)).toEqual(['a', 'b']);
	});
	it('handles no sessions', () => {
		expect(groupSessions([], '2026-06-06')).toEqual({ today: [], upcoming: [], earlier: [] });
	});
});

describe('progress', () => {
	it('counts finished drills', () => {
		expect(progress(session('x', '2026-06-06', [true, false, true]))).toEqual({ done: 2, total: 3 });
		expect(isFinished(session('x', '2026-06-06', [true, true]))).toBe(true);
		expect(isFinished(session('x', '2026-06-06', [true, false]))).toBe(false);
		expect(isFinished(session('x', '2026-06-06', []))).toBe(false);
	});
	it('flags unfinished sessions in the past only', () => {
		expect(isMissed(session('x', '2026-06-05', [true, false]), '2026-06-06')).toBe(true);
		expect(isMissed(session('x', '2026-06-05', [true, true]), '2026-06-06')).toBe(false);
		expect(isMissed(session('x', '2026-06-06', [false]), '2026-06-06')).toBe(false);
	});
});

describe('optimistic updates', () => {
	it('checks a drill, finishing the session when it was the last one', () => {
		const s = session('x', '2026-06-06', [true, false]);
		const next = withItemCompleted(s, 'x-1', true, '2026-06-06T11:00:00.000Z');
		expect(next.items[1]!.completedAt).toBe('2026-06-06T11:00:00.000Z');
		expect(next.completedAt).toBe('2026-06-06T11:00:00.000Z');
		expect(s.items[1]!.completedAt).toBeNull(); // input untouched
	});
	it('unchecking reopens the session', () => {
		const s = session('x', '2026-06-06', [true, true]);
		const next = withItemCompleted(s, 'x-0', false);
		expect(next.items[0]!.completedAt).toBeNull();
		expect(next.completedAt).toBeNull();
	});
	it('replaces just the matching session', () => {
		const list = [session('a', '2026-06-06', [false]), session('b', '2026-06-07', [false])];
		const out = replaceSession(list, session('b', '2026-06-07', [true]));
		expect(out[0]).toBe(list[0]);
		expect(out[1]!.completedAt).not.toBeNull();
	});
});

describe('dates', () => {
	it('formats a day without shifting it', () => {
		expect(formatDay('2026-06-06', 'en-US')).toBe('Sat, Jun 6');
		expect(formatDay('2026-01-01', 'en-US')).toBe('Thu, Jan 1');
	});
	it('reads the local calendar day', () => {
		expect(localDate(new Date(2026, 5, 6, 23, 59))).toBe('2026-06-06');
		expect(localDate(new Date(2026, 0, 2, 0, 1))).toBe('2026-01-02');
	});
});

describe('groupByPhase', () => {
	const phases = [
		{ id: 'p1', title: 'Mechanics', description: 'd', measure: null, fromLesson: 1, toLesson: 2 },
		{ id: 'p2', title: 'Skills', description: 'd', measure: 'm', fromLesson: 3, toLesson: 4 }
	];
	const list = [session('a', '2026-06-01', [true]), session('b', '2026-06-03', [true]), session('c', '2026-06-05', [false]), session('d', '2026-06-07', [false]), session('x', '2026-06-08', [false])];
	const lessons = { a: 1, b: 2, c: 3, d: 4 };
	it('groups by lesson range, marks the phase of the next lesson current, and counts done', () => {
		const g = groupByPhase(list, lessons, phases, '2026-06-04');
		expect(g.map((x) => [x.id, x.current, x.done, x.total])).toEqual([['p1', false, 2, 2], ['p2', true, 0, 2], ['other', false, 0, 1]]);
		expect(g[1]!.firstDay).toBe('2026-06-05');
	});
	it('leaves today out of the phase list but keeps it in the count', () => {
		const g = groupByPhase(list, lessons, phases, '2026-06-05');
		expect(g[1]!.sessions.map((s) => s.id)).toEqual(['d']);
		expect(g[1]!.total).toBe(2);
		expect(g[1]!.current).toBe(true);
	});
	it('has no current phase when everything is done, and drops empty phases', () => {
		const done = list.slice(0, 2).map((s) => s);
		const g = groupByPhase(done, lessons, phases, '2026-07-01');
		expect(g.map((x) => x.id)).toEqual(['p1']);
		expect(g[0]!.current).toBe(false);
	});
});

describe('formatRange', () => {
	it('joins two days, or shows one', () => {
		expect(formatRange('2026-10-28', '2026-11-26', 'en-US')).toBe('Oct 28 - Nov 26');
		expect(formatRange('2026-10-28', '2026-10-28', 'en-US')).toBe('Oct 28');
	});
});

describe('splitByDay (upcoming on top, earlier days in history)', () => {
	it('on Nov 2 the Oct 28 session is history and Nov 2 onwards is upcoming, soonest first', () => {
		const all = [session('nov5', '2026-11-05', [false]), session('oct28', '2026-10-28', [false]), session('nov2', '2026-11-02', [false]), session('oct30', '2026-10-30', [true]), session('nov3', '2026-11-03', [false])];
		const g = splitByDay(all, '2026-11-02');
		expect(g.upcoming.map((s) => s.id)).toEqual(['nov2', 'nov3', 'nov5']);
		expect(g.history.map((s) => s.id)).toEqual(['oct30', 'oct28']);
	});
	it('puts a session dated exactly today in upcoming, and handles nothing at all', () => {
		expect(splitByDay([session('t', '2026-06-06', [])], '2026-06-06').upcoming).toHaveLength(1);
		expect(splitByDay([], '2026-06-06')).toEqual({ upcoming: [], history: [] });
	});
	it('keeps a session with no valid date in upcoming, after the dated ones', () => {
		const g = splitByDay([session('none', '', [false]), session('later', '2026-06-09', [false]), session('old', '2026-06-01', [false])], '2026-06-06');
		expect(g.upcoming.map((s) => s.id)).toEqual(['later', 'none']);
		expect(g.history.map((s) => s.id)).toEqual(['old']);
		expect(isPast(session('none', '', []), '2026-06-06')).toBe(false);
	});
	it('does not change the groupSessions split into today / upcoming / earlier', () => {
		const g = groupSessions([session('none', '', [false])], '2026-06-06');
		expect(g.upcoming).toHaveLength(1);
		expect(g.earlier).toHaveLength(0);
	});
});

describe('the player\'s local day decides what is past (not UTC)', () => {
	// Local-time constructors, so these hold in any timezone the tests run in.
	it('a late evening is still the same local day, even when UTC has already moved on', () => {
		const lateNight = new Date(2026, 10, 2, 23, 45);
		expect(localDate(lateNight)).toBe('2026-11-02');
		const g = splitByDay([session('today', '2026-11-02', [false]), session('yesterday', '2026-11-01', [false])], localDate(lateNight));
		expect(g.upcoming.map((s) => s.id)).toEqual(['today']);
		expect(g.history.map((s) => s.id)).toEqual(['yesterday']);
	});
	it('just after midnight is already the new day, even when UTC is still on the old one', () => {
		const earlyMorning = new Date(2026, 10, 3, 0, 10);
		expect(localDate(earlyMorning)).toBe('2026-11-03');
		const g = splitByDay([session('nov2', '2026-11-02', [false]), session('nov3', '2026-11-03', [false])], localDate(earlyMorning));
		expect(g.history.map((s) => s.id)).toEqual(['nov2']);
		expect(g.upcoming.map((s) => s.id)).toEqual(['nov3']);
	});
	it('crosses a year end by date text, not by arithmetic', () => {
		expect(splitByDay([session('dec31', '2026-12-31', [false])], localDate(new Date(2027, 0, 1, 0, 5))).history).toHaveLength(1);
	});
});

describe('favorites helpers', () => {
	const withDrill = (s: PlanSessionDto, drillId: string): PlanSessionDto => ({ ...s, items: [{ ...s.items[0]!, drillId, name: `Name ${drillId}`, minutes: 12 }] });
	const all = [withDrill(session('old', '2026-10-28', [false]), 'dA'), withDrill(session('soon', '2026-11-05', [false]), 'dA'), withDrill(session('older', '2026-10-20', [true]), 'dB')];
	it('lists starred sessions upcoming first, then past latest first, and drops ones no longer on the plan', () => {
		expect(favoriteSessionList(all, ['older', 'old', 'soon', 'gone'], '2026-11-02').map((s) => s.id)).toEqual(['soon', 'old', 'older']);
	});
	it('shows a starred drill in its next session, else its most recent one, and skips drills not in any session', () => {
		const e = favoriteDrillEntries(all, ['dB', 'dA', 'dZ'], '2026-11-02');
		expect(e.map((x) => [x.drillId, x.session.id, x.name, x.minutes])).toEqual([['dB', 'older', 'Name dB', 12], ['dA', 'soon', 'Name dA', 12]]);
	});
});
