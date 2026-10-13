import { addDays, type CalendarItem } from '@ttg/shared';

/**
 * Date maths for the calendar. Days are `YYYY-MM-DD` strings and all arithmetic is in UTC, so a day never shifts with
 * the browser's or server's timezone. "Today" comes from the browser (`localDate`).
 */

export type View = 'month' | 'week' | 'list';

/** First day of the week: Sunday (0) or Monday (1). */
export type WeekStart = 0 | 1;

const parts = (iso: string) => {
	const [y, m, d] = iso.split('-').map(Number);
	return { y: y!, m: m! - 1, d: d! };
};
const pad = (n: number) => String(n).padStart(2, '0');
export const toIso = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;

/** 0 (Sunday) to 6 for a day. */
export const weekdayOf = (iso: string) => new Date(`${iso}T00:00:00Z`).getUTCDay();

export const startOfWeek = (iso: string, weekStart: WeekStart = 0) => addDays(iso, -((weekdayOf(iso) - weekStart + 7) % 7))!;

export const weekDays = (iso: string, weekStart: WeekStart = 0) => {
	const first = startOfWeek(iso, weekStart);
	return Array.from({ length: 7 }, (_, i) => addDays(first, i)!);
};

export const firstOfMonth = (iso: string) => {
	const { y, m } = parts(iso);
	return toIso(y, m, 1);
};

/** The day a month earlier or later (the 1st, so it never overflows into the next month). */
export const shiftMonth = (iso: string, delta: number) => {
	const { y, m } = parts(iso);
	const t = new Date(Date.UTC(y, m + delta, 1));
	return toIso(t.getUTCFullYear(), t.getUTCMonth(), 1);
};

export const shiftWeek = (iso: string, delta: number) => addDays(iso, delta * 7)!;

/** The weeks of a month as rows of 7 days, including the days of neighbouring months that fill the first and last row. */
export const monthGrid = (iso: string, weekStart: WeekStart = 0): string[][] => {
	const first = firstOfMonth(iso);
	const { y, m } = parts(first);
	const daysInMonth = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
	const last = toIso(y, m, daysInMonth);
	const weeks: string[][] = [];
	for (let start = startOfWeek(first, weekStart); start <= last; start = addDays(start, 7)!) weeks.push(weekDays(start, weekStart));
	return weeks;
};

export const inMonth = (day: string, anchor: string) => day.slice(0, 7) === anchor.slice(0, 7);

export const itemsByDate = (items: readonly CalendarItem[]) => {
	const map = new Map<string, CalendarItem[]>();
	for (const it of items) map.set(it.date, [...(map.get(it.date) ?? []), it]);
	return map;
};

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const monthLabel = (iso: string) => {
	const { y, m } = parts(iso);
	return `${MONTHS[m]} ${y}`;
};
export const dayLabel = (iso: string) => {
	const { m, d } = parts(iso);
	return `${DAYS[weekdayOf(iso)]}, ${MONTHS[m]} ${d}`;
};
export const weekLabel = (iso: string, weekStart: WeekStart = 0) => {
	const days = weekDays(iso, weekStart);
	const a = parts(days[0]!);
	const b = parts(days[6]!);
	return a.m === b.m ? `${MONTHS[a.m]} ${a.d} to ${b.d}, ${a.y}` : `${MONTHS[a.m]!.slice(0, 3)} ${a.d} to ${MONTHS[b.m]!.slice(0, 3)} ${b.d}, ${b.y}`;
};
/** Narrow weekday headers for the grid, in order from `weekStart`. */
export const weekdayHeaders = (weekStart: WeekStart = 0) => Array.from({ length: 7 }, (_, i) => DAYS[(weekStart + i) % 7]!);

/** What a day looks like on a narrow grid: distinct kinds present, so the cell can show one marker per kind. */
export const kindsOn = (items: readonly CalendarItem[]) => [...new Set(items.map((i) => i.kind))];

/** Items grouped by day for the list view, from `today` on first (upcoming), then earlier days newest first. */
export const listGroups = (items: readonly CalendarItem[], today: string) => {
	const byDay = itemsByDate(items);
	const days = [...byDay.keys()].sort();
	const upcoming = days.filter((d) => d >= today).map((d) => ({ date: d, items: byDay.get(d)! }));
	const earlier = days.filter((d) => d < today).reverse().map((d) => ({ date: d, items: byDay.get(d)! }));
	return { upcoming, earlier };
};
