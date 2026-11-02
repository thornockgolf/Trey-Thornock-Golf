import type { CalendarItem } from '@ttg/shared';
import { describe, expect, it } from 'vitest';
import { dayLabel, firstOfMonth, inMonth, itemsByDate, drillSummary, kindsOn, monthGrid, monthLabel, placeCard, shiftMonth, startOfWeek, weekDays, weekdayHeaders } from './calendar-view';

const item = (date: string, kind: CalendarItem['kind'] = 'session', id = date + kind): CalendarItem => ({ kind, id, date, title: kind, status: 'open', detail: null });

describe('weeks', () => {
	it('starts the week on Sunday or Monday', () => {
		expect(startOfWeek('2026-10-14')).toBe('2026-10-11'); // a Wednesday
		expect(startOfWeek('2026-10-14', 1)).toBe('2026-10-12');
		expect(startOfWeek('2026-10-11')).toBe('2026-10-11'); // a Sunday is its own week start
		expect(startOfWeek('2026-10-11', 1)).toBe('2026-10-05');
		expect(weekDays('2026-10-14')).toEqual(['2026-10-11', '2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17']);
	});
	it('labels', () => {
		expect(weekdayHeaders(1)[0]).toBe('Monday');
		expect(dayLabel('2026-10-12')).toBe('Monday, October 12');
	});
});

describe('monthGrid', () => {
	it('fills whole weeks around the month', () => {
		const g = monthGrid('2026-10-14');
		expect(g.every((w) => w.length === 7)).toBe(true);
		expect(g[0]![0]).toBe('2026-09-27'); // October 1 2026 is a Thursday; the week starts Sunday Sep 27
		expect(g.at(-1)!.at(-1)).toBe('2026-10-31');
		expect(g.flat().filter((d) => inMonth(d, '2026-10-14'))).toHaveLength(31);
	});
	it('uses five rows when it can and six when it must', () => {
		expect(monthGrid('2026-02-10')).toHaveLength(4); // Feb 2026 starts on a Sunday and has 28 days
		expect(monthGrid('2026-08-10')).toHaveLength(6); // Aug 2026 starts on a Saturday and has 31 days
	});
	it('honors a Monday start', () => {
		expect(monthGrid('2026-10-14', 1)[0]![0]).toBe('2026-09-28');
	});
	it('shifts months from the 1st so the 31st never overflows', () => {
		expect(shiftMonth('2026-01-31', 1)).toBe('2026-02-01');
		expect(shiftMonth('2026-12-15', 1)).toBe('2027-01-01');
		expect(shiftMonth('2026-01-15', -1)).toBe('2025-12-01');
		expect(firstOfMonth('2026-10-14')).toBe('2026-10-01');
		expect(monthLabel('2026-10-14')).toBe('October 2026');
	});
});

describe('grouping', () => {
	it('groups by day and finds the kinds on a day', () => {
		const items = [item('2026-10-20', 'session'), item('2026-10-20', 'checkin'), item('2026-10-20', 'session', 'x'), item('2026-10-22', 'assessment')];
		expect(itemsByDate(items).get('2026-10-20')).toHaveLength(3);
		expect(kindsOn(itemsByDate(items).get('2026-10-20')!)).toEqual(['session', 'checkin']);
	});
});

describe('kindsOn', () => {
	it('shows a logged practice session as a practice marker, once', () => {
		expect(kindsOn([item('2026-10-20', 'session'), item('2026-10-20', 'logged'), item('2026-10-20', 'checkin')])).toEqual(['session', 'checkin']);
	});
});

describe('drillSummary', () => {
	it('shows up to five names and counts the rest', () => {
		expect(drillSummary(['a', 'b'])).toEqual({ shown: ['a', 'b'], more: 0 });
		expect(drillSummary(['a', 'b', 'c', 'd', 'e', 'f', 'g'])).toEqual({ shown: ['a', 'b', 'c', 'd', 'e'], more: 2 });
		expect(drillSummary(undefined)).toEqual({ shown: [], more: 0 });
	});
});

describe('placeCard', () => {
	const view = { width: 1280, height: 800 };
	const card = { width: 300, height: 200 };
	it('sits below the cell, aligned to its left edge', () => {
		expect(placeCard({ left: 100, right: 200, top: 100, bottom: 160 }, card, view)).toEqual({ left: 100, top: 166 });
	});
	it('shifts left near the right edge and flips above near the bottom', () => {
		expect(placeCard({ left: 1200, right: 1270, top: 700, bottom: 760 }, card, view)).toEqual({ left: 972, top: 494 });
	});
	it('never leaves the viewport', () => {
		expect(placeCard({ left: -50, right: 20, top: 5, bottom: 10 }, card, { width: 200, height: 100 })).toEqual({ left: 8, top: 8 });
	});
});
