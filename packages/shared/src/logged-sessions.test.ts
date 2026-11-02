import { Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import { CreateLoggedSessionRequest, UpdateLoggedSessionRequest, emptyLogProblem, formatTally, logDateProblem, weekStart, weekTally } from './logged-sessions';
import { buildCalendarItems, buildLoggedCalendarItems } from './calendar';
import { normalizeTags, SESSION_TAG_LABELS } from './session-tags';

describe('tags', () => {
	it('use the product labels and normalise unknown values away', () => {
		expect(Object.values(SESSION_TAG_LABELS)).toEqual(['Mechanical technique', 'Skill', 'Situational practice']);
		expect(normalizeTags(['skill', 'bogus', 'mechanical', 'skill'])).toEqual(['mechanical', 'skill']);
		expect(normalizeTags(null)).toEqual([]);
	});
});

describe('request schemas', () => {
	const ok = (schema: Schema.Decoder<unknown, never>, v: unknown) => { try { Schema.decodeUnknownSync(schema)(v); return true; } catch { return false; } };
	it('accept a minimal log and reject bad tags, minutes, notes and drill ids', () => {
		expect(ok(CreateLoggedSessionRequest, { date: '2026-11-02' })).toBe(true);
		expect(ok(CreateLoggedSessionRequest, { date: '2026-11-02', tags: ['nope'] })).toBe(false);
		expect(ok(CreateLoggedSessionRequest, { date: '2026-11-02', minutes: 0 })).toBe(false);
		expect(ok(CreateLoggedSessionRequest, { date: '2026-11-02', notes: 'x'.repeat(2001) })).toBe(false);
		expect(ok(CreateLoggedSessionRequest, { date: '2026-11-02', drillIds: ['x'] })).toBe(false);
		expect(ok(UpdateLoggedSessionRequest, { minutes: null, videoId: null })).toBe(true);
	});
});

describe('rules', () => {
	it('an empty log has no tag, text or drill', () => {
		expect(emptyLogProblem({ tags: [], workedOn: ' ', notes: '' })).toMatch(/Pick at least one/);
		expect(emptyLogProblem({ tags: ['skill'] })).toBeNull();
		expect(emptyLogProblem({ notes: 'x' })).toBeNull();
		expect(emptyLogProblem({ drillIds: ['d'] })).toBeNull();
	});
	it('dates: today and tomorrow (time zones) pass, later is the future, very old is too far back', () => {
		expect(logDateProblem('2026-11-02', '2026-11-02')).toBeNull();
		expect(logDateProblem('2026-11-03', '2026-11-02')).toBeNull();
		expect(logDateProblem('2026-11-04', '2026-11-02')).toMatch(/future/);
		expect(logDateProblem('2025-01-01', '2026-11-02')).toMatch(/too far/);
		expect(logDateProblem('2026-02-30', '2026-11-02')).toMatch(/real date/);
	});
});

describe('the weekly tally counts planned and extra apart', () => {
	it('weeks run Monday to Sunday', () => {
		expect(weekStart('2026-11-02')).toBe('2026-11-02'); // a Monday
		expect(weekStart('2026-11-08')).toBe('2026-11-02'); // the Sunday
		expect(weekStart('2026-11-09')).toBe('2026-11-09');
	});
	it('tallies this week only, and formats it', () => {
		const planned = [
			{ scheduledOn: '2026-11-02', completedAt: '2026-11-02T10:00:00Z' },
			{ scheduledOn: '2026-11-04', completedAt: null },
			{ scheduledOn: '2026-11-06', completedAt: null },
			{ scheduledOn: '2026-11-09', completedAt: null }
		];
		const t = weekTally(planned, [{ date: '2026-11-03' }, { date: '2026-10-30' }], '2026-11-04');
		expect(t).toEqual({ plannedTotal: 3, plannedDone: 1, extra: 1 });
		expect(formatTally(t)).toBe('3 planned (1 done), 1 extra');
		expect(formatTally({ plannedTotal: 0, plannedDone: 0, extra: 0 })).toBe('no planned sessions, no extras');
	});
});

describe('calendar items for extras', () => {
	it('carry tags, minutes, notes and the video id', () => {
		const items = buildLoggedCalendarItems([
			{ id: 'l', playerId: 'p', date: '2026-11-02', tags: ['skill'], minutes: 30, workedOn: null, drills: [], notes: 'n', video: { id: 'v', status: 'ready', title: null }, createdAt: '' }
		]);
		expect(items).toEqual([{ kind: 'logged', id: 'l', date: '2026-11-02', title: 'Extra session', status: 'done', detail: '30 min', tags: ['skill'], notes: 'n', videoId: 'v' }]);
		expect(buildLoggedCalendarItems(undefined)).toEqual([]);
		expect(buildLoggedCalendarItems([{ id: 'l2', playerId: 'p', date: '2026-11-02', tags: [], minutes: null, workedOn: ' Putting ', drills: [], notes: null, video: null, createdAt: '' }])[0]).toMatchObject({ title: 'Putting', detail: null });
	});
	it('join the calendar between planned sessions and check-ins on the same day', () => {
		const items = buildCalendarItems({
			sessions: [{ id: 's', title: 'S', planTitle: null, scheduledOn: '2026-11-02', durationMin: 30, completedAt: null, items: [] }],
			logged: [{ id: 'l', playerId: 'p', date: '2026-11-02', tags: ['skill'], minutes: 20, workedOn: null, drills: [], notes: null, video: null, createdAt: '' }],
			checkIns: [{ id: 'c', playerId: 'p', scheduledOn: '2026-11-02', answers: null, submittedAt: null }],
			results: []
		});
		expect(items.map((i) => i.kind)).toEqual(['session', 'logged', 'checkin']);
		expect(items[1]).toMatchObject({ status: 'done', tags: ['skill'], detail: '20 min' });
	});
});
