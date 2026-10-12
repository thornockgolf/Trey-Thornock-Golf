import {
	MAX_ITEMS_PER_SESSION,
	MAX_PLAN_SESSIONS,
	SESSION_LENGTHS,
	type DrillDto,
	type PlanStructure,
	type SessionLength
} from '@ttg/shared';

/**
 * State and rules of the plan composer, without the DOM: a plan is ordered sessions of a fixed length (30, 45, 60 or
 * 90 minutes), each a list of drills with the minutes spent on them, and a session is only valid when those minutes add
 * up to its length exactly (the same rule the server enforces and the legacy verifier used).
 */

export interface ComposerItem {
	drillId: string;
	minutes: number;
}
export interface ComposerSession {
	/** A stable key for the UI; not stored. */
	key: string;
	title: string;
	durationMin: SessionLength;
	items: ComposerItem[];
}
export interface ComposerPlan {
	title: string;
	sessions: ComposerSession[];
}

let counter = 0;
const nextKey = () => `s${++counter}`;

export const emptyPlan = (): ComposerPlan => ({ title: '', sessions: [newSession(1)] });

export const newSession = (n: number, durationMin: SessionLength = 60): ComposerSession => ({
	key: nextKey(),
	title: `Session ${n}`,
	durationMin,
	items: []
});

export const fromStructure = (title: string, structure: PlanStructure): ComposerPlan => ({
	title,
	sessions: structure.sessions.map((s) => ({ key: nextKey(), title: s.title, durationMin: s.durationMin, items: s.items.map((i) => ({ ...i })) }))
});

export const toStructure = (plan: ComposerPlan): PlanStructure => ({
	v: 1,
	sessions: plan.sessions.map((s) => ({ title: s.title.trim(), durationMin: s.durationMin, items: s.items.map((i) => ({ drillId: i.drillId, minutes: i.minutes })) }))
});

export const sessionTotal = (s: ComposerSession) => s.items.reduce((n, i) => n + i.minutes, 0);

/** Minutes still to place in a session (negative when over). */
export const remaining = (s: ComposerSession) => s.durationMin - sessionTotal(s);

export type SessionStatus = { kind: 'ok' } | { kind: 'under'; minutes: number } | { kind: 'over'; minutes: number } | { kind: 'empty' };

export const sessionStatus = (s: ComposerSession): SessionStatus => {
	if (s.items.length === 0) return { kind: 'empty' };
	const r = remaining(s);
	return r === 0 ? { kind: 'ok' } : r > 0 ? { kind: 'under', minutes: r } : { kind: 'over', minutes: -r };
};

export const statusText = (s: ComposerSession) => {
	const st = sessionStatus(s);
	const total = `${sessionTotal(s)} of ${s.durationMin} min`;
	switch (st.kind) {
		case 'ok':
			return `${total}`;
		case 'empty':
			return `Add at least one drill (${s.durationMin} min)`;
		case 'under':
			return `${total}: ${st.minutes} min left to place`;
		case 'over':
			return `${total}: ${st.minutes} min too many`;
	}
};

/** Everything that stops the plan from being saved, in words, with the session it is about. */
export const planProblems = (plan: ComposerPlan): string[] => {
	const out: string[] = [];
	if (plan.title.trim().length === 0) out.push('Give the plan a title.');
	if (plan.sessions.length === 0) out.push('Add at least one session.');
	for (const s of plan.sessions) {
		if (s.title.trim().length === 0) out.push('Every session needs a title.');
		const st = sessionStatus(s);
		if (st.kind === 'empty') out.push(`"${s.title || 'Untitled'}" has no drills.`);
		if (st.kind === 'under') out.push(`"${s.title}" has ${st.minutes} min left to place.`);
		if (st.kind === 'over') out.push(`"${s.title}" is ${st.minutes} min over.`);
	}
	return [...new Set(out)];
};

export const canSave = (plan: ComposerPlan) => planProblems(plan).length === 0;

// ---- edits (each returns a new plan)

const withSession = (plan: ComposerPlan, key: string, f: (s: ComposerSession) => ComposerSession): ComposerPlan => ({
	...plan,
	sessions: plan.sessions.map((s) => (s.key === key ? f(s) : s))
});

export const addSession = (plan: ComposerPlan): ComposerPlan =>
	plan.sessions.length >= MAX_PLAN_SESSIONS ? plan : { ...plan, sessions: [...plan.sessions, newSession(plan.sessions.length + 1, plan.sessions.at(-1)?.durationMin ?? 60)] };

export const removeSession = (plan: ComposerPlan, key: string): ComposerPlan => ({ ...plan, sessions: plan.sessions.filter((s) => s.key !== key) });

export const moveSession = (plan: ComposerPlan, key: string, dir: -1 | 1): ComposerPlan => {
	const i = plan.sessions.findIndex((s) => s.key === key);
	const j = i + dir;
	if (i < 0 || j < 0 || j >= plan.sessions.length) return plan;
	const sessions = [...plan.sessions];
	[sessions[i], sessions[j]] = [sessions[j]!, sessions[i]!];
	return { ...plan, sessions };
};

export const setSessionTitle = (plan: ComposerPlan, key: string, title: string) => withSession(plan, key, (s) => ({ ...s, title }));
export const setSessionLength = (plan: ComposerPlan, key: string, durationMin: SessionLength) => withSession(plan, key, (s) => ({ ...s, durationMin }));

/** Add a drill. Its minutes are the drill's default, or whatever is left in the session, whichever is smaller (at least 1). */
export const addDrill = (plan: ComposerPlan, key: string, drill: Pick<DrillDto, 'id' | 'defaultMinutes'>): ComposerPlan =>
	withSession(plan, key, (s) => {
		if (s.items.length >= MAX_ITEMS_PER_SESSION) return s;
		const left = remaining(s);
		const minutes = Math.max(1, Math.min(drill.defaultMinutes ?? 10, left > 0 ? left : 10));
		return { ...s, items: [...s.items, { drillId: drill.id, minutes }] };
	});

export const setMinutes = (plan: ComposerPlan, key: string, index: number, minutes: number) =>
	withSession(plan, key, (s) => ({
		...s,
		items: s.items.map((it, i) => (i === index ? { ...it, minutes: Math.max(1, Math.min(90, Math.round(Number.isFinite(minutes) ? minutes : 1))) } : it))
	}));

export const removeItem = (plan: ComposerPlan, key: string, index: number) => withSession(plan, key, (s) => ({ ...s, items: s.items.filter((_, i) => i !== index) }));

export const moveItem = (plan: ComposerPlan, key: string, index: number, dir: -1 | 1) =>
	withSession(plan, key, (s) => {
		const j = index + dir;
		if (index < 0 || j < 0 || j >= s.items.length) return s;
		const items = [...s.items];
		[items[index], items[j]] = [items[j]!, items[index]!];
		return { ...s, items };
	});

/** Put whatever is left (or taken away, when over) on the last drill so the session adds up. Does nothing without drills. */
export const balanceSession = (plan: ComposerPlan, key: string) =>
	withSession(plan, key, (s) => {
		if (s.items.length === 0) return s;
		const last = s.items.length - 1;
		const others = s.items.slice(0, last).reduce((n, i) => n + i.minutes, 0);
		const minutes = s.durationMin - others;
		if (minutes < 1) return s; // the earlier drills already fill the session: nothing sensible to do
		return { ...s, items: s.items.map((it, i) => (i === last ? { ...it, minutes } : it)) };
	});

export const SESSION_LENGTH_OPTIONS = SESSION_LENGTHS;
