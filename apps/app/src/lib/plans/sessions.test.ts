import type { PlanSessionDto } from '@ttg/shared';
import { describe, expect, it } from 'vitest';
import { formatDay, groupSessions, isFinished, isMissed, localDate, progress, replaceSession, withItemCompleted } from './sessions';

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
