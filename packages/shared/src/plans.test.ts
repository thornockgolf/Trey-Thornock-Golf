import { Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import { PlanStructure, SESSION_LENGTHS, drillIdsOf, sessionTotalIssues } from './plans';

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
