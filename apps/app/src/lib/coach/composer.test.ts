import { describe, expect, it } from 'vitest';
import {
	addDrill,
	addPhase,
	gapText,
	lessonCoverage,
	movePhase,
	phaseIssuesFor,
	phaseProblems,
	removePhase,
	updatePhase,
	addSession,
	balanceSession,
	canSave,
	emptyPlan,
	fromStructure,
	moveItem,
	moveSession,
	planProblems,
	remaining,
	removeItem,
	removeSession,
	sessionStatus,
	setMinutes,
	setSessionLength,
	statusText,
	toStructure,
	type ComposerPlan
} from './composer';

const D1 = '00000000-0000-4000-8000-000000000001';
const D2 = '00000000-0000-4000-8000-000000000002';
const drill = (id: string, defaultMinutes: number | null = null) => ({ id, defaultMinutes });

const filled = (): ComposerPlan => {
	let p = emptyPlan();
	p.title = 'Short game week';
	const k = p.sessions[0]!.key;
	p = setSessionLength(p, k, 30);
	p = addDrill(p, k, drill(D1, 10));
	p = addDrill(p, k, drill(D2, 20));
	return p;
};

describe('totals', () => {
	it('a session is ok only when drill minutes equal its length exactly', () => {
		const p = filled();
		expect(sessionStatus(p.sessions[0]!)).toEqual({ kind: 'ok' });
		expect(canSave(p)).toBe(true);
		const k = p.sessions[0]!.key;
		expect(sessionStatus(setMinutes(p, k, 1, 15).sessions[0]!)).toEqual({ kind: 'under', minutes: 5 });
		expect(sessionStatus(setMinutes(p, k, 1, 25).sessions[0]!)).toEqual({ kind: 'over', minutes: 5 });
		expect(sessionStatus(emptyPlan().sessions[0]!)).toEqual({ kind: 'empty' });
	});

	it.each([30, 45, 60, 90] as const)('a %i minute session can be balanced to add up', (len) => {
		let p = emptyPlan();
		p.title = 't';
		const k = p.sessions[0]!.key;
		p = setSessionLength(p, k, len);
		p = addDrill(p, k, drill(D1, 7));
		p = addDrill(p, k, drill(D2, 9));
		p = balanceSession(p, k);
		expect(remaining(p.sessions[0]!)).toBe(0);
		expect(canSave(p)).toBe(true);
	});

	it('explains what is wrong in words', () => {
		const p = filled();
		const k = p.sessions[0]!.key;
		expect(statusText(p.sessions[0]!)).toBe('30 of 30 min');
		expect(statusText(setMinutes(p, k, 1, 15).sessions[0]!)).toMatch(/5 min left to place/);
		expect(statusText(setMinutes(p, k, 1, 25).sessions[0]!)).toMatch(/5 min too many/);
		expect(planProblems({ title: '', sessions: [], phases: [] })).toEqual(['Give the plan a title.', 'Add at least one session.']);
		expect(planProblems(setMinutes(p, k, 1, 15))).toEqual(['"Session 1" has 5 min left to place.']);
	});
});

describe('adding drills', () => {
	it('uses the drill default but never more than what is left', () => {
		let p = emptyPlan();
		const k = p.sessions[0]!.key;
		p = setSessionLength(p, k, 30);
		p = addDrill(p, k, drill(D1, 20));
		expect(p.sessions[0]!.items[0]!.minutes).toBe(20);
		p = addDrill(p, k, drill(D2, 20));
		expect(p.sessions[0]!.items[1]!.minutes).toBe(10);
		p = addDrill(p, k, drill(D2));
		expect(p.sessions[0]!.items[2]!.minutes).toBe(10); // nothing left: falls back to a default of 10, the coach adjusts
	});

	it('caps the number of drills in a session', () => {
		let p = emptyPlan();
		const k = p.sessions[0]!.key;
		for (let i = 0; i < 30; i++) p = addDrill(p, k, drill(D1, 1));
		expect(p.sessions[0]!.items.length).toBe(20);
	});

	it('clamps typed minutes to 1-90 whole minutes', () => {
		const p = filled();
		const k = p.sessions[0]!.key;
		expect(setMinutes(p, k, 0, 0).sessions[0]!.items[0]!.minutes).toBe(1);
		expect(setMinutes(p, k, 0, 500).sessions[0]!.items[0]!.minutes).toBe(90);
		expect(setMinutes(p, k, 0, 7.6).sessions[0]!.items[0]!.minutes).toBe(8);
		expect(setMinutes(p, k, 0, NaN).sessions[0]!.items[0]!.minutes).toBe(1);
	});
});

describe('balanceSession', () => {
	it('puts the difference on the last drill, or leaves it alone when that would be nonsense', () => {
		let p = filled();
		const k = p.sessions[0]!.key;
		p = setMinutes(p, k, 1, 5);
		expect(balanceSession(p, k).sessions[0]!.items[1]!.minutes).toBe(20);
		const full = setMinutes(p, k, 0, 40);
		expect(balanceSession(full, k)).toEqual(full);
		expect(balanceSession(emptyPlan(), emptyPlan().sessions[0]!.key)).toBeDefined();
	});
});

describe('ordering', () => {
	it('moves and removes drills and sessions', () => {
		let p = filled();
		const k = p.sessions[0]!.key;
		p = moveItem(p, k, 0, 1);
		expect(p.sessions[0]!.items.map((i) => i.drillId)).toEqual([D2, D1]);
		expect(moveItem(p, k, 0, -1)).toEqual(p);
		p = removeItem(p, k, 0);
		expect(p.sessions[0]!.items.map((i) => i.drillId)).toEqual([D1]);

		let q = addSession(addSession(filled()));
		const keys = q.sessions.map((s) => s.key);
		q = moveSession(q, keys[2]!, -1);
		expect(q.sessions.map((s) => s.key)).toEqual([keys[0], keys[2], keys[1]]);
		expect(moveSession(q, keys[0]!, -1)).toEqual(q);
		expect(removeSession(q, keys[1]!).sessions.length).toBe(2);
	});
});

describe('structure round trip', () => {
	it('what is saved is what is loaded', () => {
		const p = filled();
		const s = toStructure(p);
		expect(s).toEqual({ v: 1, sessions: [{ title: 'Session 1', durationMin: 30, items: [{ drillId: D1, minutes: 10 }, { drillId: D2, minutes: 20 }] }], phases: [] });
		expect(toStructure(fromStructure('x', s))).toEqual(s);
	});
});

describe('roadmap phases', () => {
	const planOf = (n: number): ComposerPlan => {
		const p = emptyPlan();
		for (let i = 1; i < n; i++) p.sessions.push(...addSession({ ...p, sessions: [] }).sessions);
		return p;
	};

	it('toStructure always sends phases, with a trimmed optional measure', () => {
		let p = planOf(4);
		expect(toStructure(p).phases).toEqual([]);
		p = addPhase(p);
		p = updatePhase(p, p.phases[0]!.key, { title: ' Setup ', description: ' why ', measure: '  ' });
		const [ph] = toStructure(p).phases!;
		expect(ph).toMatchObject({ title: 'Setup', description: 'why', fromLesson: 1, toLesson: 1 });
		expect('measure' in ph!).toBe(false);
	});

	it('round-trips through fromStructure', () => {
		const structure = { ...toStructure(planOf(3)), phases: [{ id: 'a', title: 'T', description: 'D', measure: 'M', fromLesson: 1, toLesson: 2 }] };
		const back = fromStructure('x', structure);
		expect(back.phases[0]).toMatchObject({ key: 'a', measure: 'M', toLesson: 2 });
		expect(fromStructure('x', { v: 1, sessions: structure.sessions }).phases).toEqual([]);
	});

	it('Add phase pre-fills the next free lesson after the last phase', () => {
		let p = planOf(5);
		p = addPhase(p);
		p = updatePhase(p, p.phases[0]!.key, { toLesson: 2 });
		p = addPhase(p);
		expect(p.phases[1]).toMatchObject({ fromLesson: 3, toLesson: 3 });
	});

	it('flags range problems the way the server does, and blocks saving', () => {
		let p = planOf(3);
		p.title = 'T';
		p.sessions.forEach((s) => (s.items = [{ drillId: D1, minutes: 60 }]));
		p = addPhase(p);
		p = updatePhase(p, p.phases[0]!.key, { title: 'A', fromLesson: 1, toLesson: 4 });
		expect(phaseIssuesFor(p, 0)).toContain('This plan only has 3 lessons.');
		expect(canSave(p)).toBe(false);
		p = updatePhase(p, p.phases[0]!.key, { toLesson: 2 });
		p = addPhase(p);
		p = updatePhase(p, p.phases[1]!.key, { title: 'B', fromLesson: 2, toLesson: 3 });
		expect(phaseProblems(p).join()).toMatch(/overlaps/);
		expect(phaseIssuesFor(p, 1).join()).toMatch(/inside or before/);
		p = updatePhase(p, p.phases[1]!.key, { fromLesson: 3 });
		expect(phaseProblems(p)).toEqual([]);
		expect(canSave(p)).toBe(true);
		p = updatePhase(p, p.phases[1]!.key, { fromLesson: NaN });
		expect(canSave(p)).toBe(false);
	});

	it('moving swaps wording but keeps the ranges in order', () => {
		let p = planOf(4);
		p = addPhase(p);
		p = updatePhase(p, p.phases[0]!.key, { title: 'A', toLesson: 2 });
		p = addPhase(p);
		p = updatePhase(p, p.phases[1]!.key, { title: 'B', toLesson: 4 });
		p = movePhase(p, p.phases[1]!.key, -1);
		expect(p.phases.map((x) => [x.title, x.fromLesson, x.toLesson])).toEqual([['B', 1, 2], ['A', 3, 4]]);
		expect(removePhase(p, p.phases[0]!.key).phases).toHaveLength(1);
	});

	it('reports covered lessons and gaps', () => {
		let p = planOf(6);
		p = addPhase(p);
		p = updatePhase(p, p.phases[0]!.key, { toLesson: 2 });
		p = addPhase(p);
		p = updatePhase(p, p.phases[1]!.key, { fromLesson: 5, toLesson: 5 });
		expect(lessonCoverage(p).map((c) => c.phase)).toEqual([0, 0, null, null, 1, null]);
		expect(gapText(p)).toBe('3-4, 6');
	});
});
