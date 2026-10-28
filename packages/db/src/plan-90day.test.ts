import { PlanStructure, addDays, drillIdsOf, phaseIssues, sessionTotalIssues } from '@ttg/shared';
import { Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import { NEW_DRILLS, PHASES, SEEDED_DRILL_NAMES, SESSIONS, buildStructure, dayOffset, sessionDates } from './plan-90day';

const names = [...SEEDED_DRILL_NAMES, ...NEW_DRILLS.map((d) => d.name)];
const structure = buildStructure(new Map(names.map((n, i) => [n, `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`])));

describe('90-day plan data', () => {
	it('has 39 lessons in three 13-lesson phases that cover them exactly', () => {
		expect(SESSIONS).toHaveLength(39);
		expect(PHASES.map((p) => [p.fromLesson, p.toLesson])).toEqual([[1, 13], [14, 26], [27, 39]]);
		expect(phaseIssues(structure)).toEqual([]);
	});
	it('decodes with the API schema', () => {
		expect(() => Schema.decodeUnknownSync(PlanStructure)(structure)).not.toThrow();
	});
	it('every session adds up to its length', () => {
		expect(sessionTotalIssues(structure)).toEqual([]);
	});
	it('only uses drills that exist, and every new drill is used and complete', () => {
		const used = new Set(SESSIONS.flatMap((s) => s.drills.map(([n]) => n)));
		for (const n of used) expect(names).toContain(n);
		for (const d of NEW_DRILLS) {
			expect(used.has(d.name), d.name).toBe(true);
			expect(d.steps.length).toBeGreaterThan(0);
			for (const f of [d.purpose, d.setup, d.cues, d.successCriteria, d.commonMistake, d.progression, d.regression]) expect(f.length).toBeGreaterThan(0);
		}
		expect(new Set(NEW_DRILLS.map((d) => d.name)).size).toBe(NEW_DRILLS.length);
		expect(drillIdsOf(structure).length).toBe(used.size);
	});
	it('schedules three a week so phases start on days 1, 31 and 61', () => {
		const dates = sessionDates('2026-11-02', addDays)!;
		expect(dates).toHaveLength(39);
		expect(dates[0]).toBe('2026-11-02');
		expect(dates[13]).toBe(addDays('2026-11-02', 30));
		expect(dates[26]).toBe(addDays('2026-11-02', 60));
		expect(dayOffset(38)).toBeLessThan(90);
		expect(sessionDates('nope', addDays)).toBeNull();
	});
	it('throws on an unknown drill name', () => {
		expect(() => buildStructure(new Map())).toThrow(/Unknown drill/);
	});
});
