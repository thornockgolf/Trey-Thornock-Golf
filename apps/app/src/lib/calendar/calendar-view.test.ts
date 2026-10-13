import type { CalendarItem } from '@ttg/shared';
import { describe, expect, it } from 'vitest';
import { dayLabel, firstOfMonth, inMonth, itemsByDate, kindsOn, listGroups, monthGrid, monthLabel, shiftMonth, shiftWeek, startOfWeek, weekDays, weekLabel, weekdayHeaders } from './calendar-view';

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
		expect(weekLabel('2026-10-14')).toBe('October 11 to 17, 2026');
		expect(weekLabel('2026-10-30')).toBe('October 25 to 31, 2026');
		expect(weekLabel('2026-10-30', 1)).toBe('Oct 26 to Nov 1, 2026'); // a Monday-start week that crosses into November
		expect(weekdayHeaders(1)[0]).toBe('Monday');
		expect(dayLabel('2026-10-12')).toBe('Monday, October 12');
	});
	it('moves by weeks across month and year ends', () => {
		expect(shiftWeek('2026-12-30', 1)).toBe('2027-01-06');
		expect(shiftWeek('2026-03-02', -1)).toBe('2026-02-23');
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
	it('lists upcoming days soonest first and earlier days newest first', () => {
		const g = listGroups([item('2026-10-01'), item('2026-10-10'), item('2026-10-12'), item('2026-10-20'), item('2026-10-15')], '2026-10-12');
		expect(g.upcoming.map((d) => d.date)).toEqual(['2026-10-12', '2026-10-15', '2026-10-20']);
		expect(g.earlier.map((d) => d.date)).toEqual(['2026-10-10', '2026-10-01']);
	});
});
