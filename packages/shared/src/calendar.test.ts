import { Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import { CheckInAnswers, RecordResultRequest, ScheduleCheckInRequest, trendOf } from './calendar';

const ID = '00000000-0000-4000-8000-000000000001';

describe('CheckInAnswers', () => {
	const ok = { roundsPlayed: 2, confidence: 4, issues: 'Pulled my irons', videoId: ID };
	it('accepts a report', () => {
		expect(Schema.decodeUnknownSync(CheckInAnswers)(ok)).toEqual(ok);
		expect(Schema.decodeUnknownSync(CheckInAnswers)({ roundsPlayed: 0, confidence: 1 })).toEqual({ roundsPlayed: 0, confidence: 1 });
	});
	it.each([
		['confidence 0', { confidence: 0 }],
		['confidence 6', { confidence: 6 }],
		['negative rounds', { roundsPlayed: -1 }],
		['too many rounds', { roundsPlayed: 31 }],
		['fractional rounds', { roundsPlayed: 1.5 }],
		['long issues', { issues: 'x'.repeat(1001) }],
		['video id that is not a uuid', { videoId: '../x' }]
	])('rejects %s', (_n, patch) => {
		expect(() => Schema.decodeUnknownSync(CheckInAnswers)({ ...ok, ...patch })).toThrow();
	});
	it('strips unknown fields', () => {
		expect((Schema.decodeUnknownSync(CheckInAnswers)({ ...ok, evil: 1 }) as any).evil).toBeUndefined();
	});
});

describe('requests', () => {
	it('schedule needs a date shape and a bounded repeat', () => {
		expect(Schema.decodeUnknownSync(ScheduleCheckInRequest)({ playerId: ID, scheduledOn: '2026-10-20', repeatWeeks: 4 })).toMatchObject({ repeatWeeks: 4 });
		expect(() => Schema.decodeUnknownSync(ScheduleCheckInRequest)({ playerId: ID, scheduledOn: '10/20/2026' })).toThrow();
		expect(() => Schema.decodeUnknownSync(ScheduleCheckInRequest)({ playerId: ID, scheduledOn: '2026-10-20', repeatWeeks: 13 })).toThrow();
	});
	it('a result value must be a finite number', () => {
		expect(Schema.decodeUnknownSync(RecordResultRequest)({ playerId: ID, value: 42.5 }).value).toBe(42.5);
		expect(() => Schema.decodeUnknownSync(RecordResultRequest)({ playerId: ID, value: NaN })).toThrow();
		expect(() => Schema.decodeUnknownSync(RecordResultRequest)({ playerId: ID, value: Infinity })).toThrow();
	});
});

describe('trendOf', () => {
	it('compares with the previous result and avoids float noise', () => {
		expect(trendOf(12, 10)).toEqual({ change: 2, trend: 'up' });
		expect(trendOf(8, 10)).toEqual({ change: -2, trend: 'down' });
		expect(trendOf(10, 10)).toEqual({ change: 0, trend: 'same' });
		expect(trendOf(0.3, 0.1 + 0.2)).toEqual({ change: 0, trend: 'same' });
		expect(trendOf(5, null)).toEqual({ change: null, trend: null });
		expect(trendOf(null, 5)).toEqual({ change: null, trend: null });
	});
});

import { buildCalendarItems } from './calendar';

describe('buildCalendarItems', () => {
	it('puts sessions, a check-in and a test on their days with distinct kinds and plain details', () => {
		const items = buildCalendarItems({
			sessions: [{ id: 's1', title: 'Putting', planTitle: 'Short game', scheduledOn: '2026-10-20', durationMin: 30, completedAt: null, items: [{ completedAt: 'x' }, { completedAt: null }] }],
			checkIns: [{ id: 'c1', playerId: 'p', scheduledOn: '2026-10-20', answers: null, submittedAt: null }, { id: 'c2', playerId: 'p', scheduledOn: '2026-10-13', answers: { roundsPlayed: 2, confidence: 4 }, submittedAt: 'x' }],
			results: [{ id: 'r1', assessmentId: 'a', name: 'Carry distance', unit: 'yd', date: '2026-10-22', value: 147, recordedAt: 'x', previousValue: 140, change: 7, trend: 'up' }, { id: 'r2', assessmentId: 'a', name: 'Putts', unit: null, date: '2026-10-20', value: null, recordedAt: null, previousValue: null, change: null, trend: null }]
		});
		expect(items.map((i) => [i.date, i.kind, i.title, i.status, i.detail])).toEqual([
			['2026-10-13', 'checkin', 'Check-in', 'done', 'Confidence 4 of 5'],
			['2026-10-20', 'session', 'Putting', 'open', '30 min · 1 of 2 drills'],
			['2026-10-20', 'checkin', 'Check-in', 'open', 'To fill in'],
			['2026-10-20', 'assessment', 'Putts', 'open', 'Scheduled'],
			['2026-10-22', 'assessment', 'Carry distance', 'done', '147 yd']
		]);
	});
});
