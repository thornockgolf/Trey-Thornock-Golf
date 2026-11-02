/** Pure helpers for the player's `/plans` view: what is today, what is next, what is behind. */
import { phaseForLesson, type PhaseDto, type PlanSessionDto } from '@ttg/shared';

/** The player's local calendar day as `YYYY-MM-DD` (sessions are dated days, not instants). */
export const localDate = (d: Date = new Date()) =>
	`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export interface SessionGroups {
	/** Today's sessions. */
	readonly today: readonly PlanSessionDto[];
	/** After today, soonest first. */
	readonly upcoming: readonly PlanSessionDto[];
	/** Before today, most recent first. Includes ones not finished. */
	readonly earlier: readonly PlanSessionDto[];
}

export const groupSessions = (sessions: readonly PlanSessionDto[], today: string): SessionGroups => {
	const byDate = (a: PlanSessionDto, b: PlanSessionDto) => a.scheduledOn.localeCompare(b.scheduledOn);
	return {
		today: sessions.filter((s) => s.scheduledOn === today).sort(byDate),
		upcoming: sessions.filter((s) => s.scheduledOn !== today && !isPast(s, today)).sort(byDate),
		earlier: sessions.filter((s) => isPast(s, today)).sort((a, b) => byDate(b, a))
	};
};

export interface DaySplit {
	/** Today or later, soonest first. Sessions with no usable date stay here too. */
	readonly upcoming: readonly PlanSessionDto[];
	/** Before today, most recent first. Includes ones not finished. */
	readonly history: readonly PlanSessionDto[];
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Dated before the player's local day. A session with no valid date is never past. */
export const isPast = (s: Pick<PlanSessionDto, 'scheduledOn'>, today: string) => DAY.test(s.scheduledOn) && s.scheduledOn < today;

/**
 * Splits sessions at the player's local day (`today` is a `YYYY-MM-DD` from `localDate()`, never a UTC day): today and
 * later are upcoming, earlier days are history. A session without a valid date has no "past", so it stays upcoming
 * (after the dated ones).
 */
export const splitByDay = (sessions: readonly PlanSessionDto[], today: string): DaySplit => {
	const dated = (s: PlanSessionDto) => DAY.test(s.scheduledOn);
	const byDate = (a: PlanSessionDto, b: PlanSessionDto) => a.scheduledOn.localeCompare(b.scheduledOn);
	return {
		upcoming: [...sessions.filter((s) => dated(s) && !isPast(s, today)).sort(byDate), ...sessions.filter((s) => !dated(s))],
		history: sessions.filter((s) => isPast(s, today)).sort((a, b) => byDate(b, a))
	};
};

export interface FavoriteDrillEntry {
	readonly drillId: string;
	readonly name: string;
	readonly minutes: number;
	/** The session to show it in: the next one that has it (today counts), else the most recent one. */
	readonly session: PlanSessionDto;
}

/** Starred drills that appear in at least one of the sessions, in the order they were starred. */
export const favoriteDrillEntries = (sessions: readonly PlanSessionDto[], drillIds: readonly string[], today: string): FavoriteDrillEntry[] => {
	const { upcoming, history } = splitByDay(sessions, today);
	const ordered = [...upcoming, ...history];
	return drillIds.flatMap((drillId) => {
		for (const session of ordered) {
			const item = session.items.find((i) => i.drillId === drillId);
			if (item) return [{ drillId, name: item.name, minutes: item.minutes, session }];
		}
		return [];
	});
};

/** Starred sessions that are still on the player's plan: upcoming first (soonest first), then past (latest first). */
export const favoriteSessionList = (sessions: readonly PlanSessionDto[], sessionIds: readonly string[], today: string): PlanSessionDto[] => {
	const { upcoming, history } = splitByDay(sessions, today);
	return [...upcoming, ...history].filter((s) => sessionIds.includes(s.id));
};

export const progress = (s: Pick<PlanSessionDto, 'items'>) => ({
	done: s.items.filter((i) => i.completedAt !== null).length,
	total: s.items.length
});

export const isFinished = (s: Pick<PlanSessionDto, 'items'>) => {
	const p = progress(s);
	return p.total > 0 && p.done === p.total;
};

/** A session in the past that was not finished, so the view can say so gently. */
export const isMissed = (s: PlanSessionDto, today: string) => s.scheduledOn < today && !isFinished(s);

/** `Sat, Jun 6` for a `YYYY-MM-DD`, in the viewer's locale and without any timezone shift. */
export const formatDay = (isoDate: string, locale?: string) => {
	const [y, m, d] = isoDate.split('-').map(Number) as [number, number, number];
	return new Date(y, m - 1, d).toLocaleDateString(locale, { weekday: 'short', month: 'short', day: 'numeric' });
};

/** Replace one session in a list (used after the server confirms a check-off). */
export const replaceSession = (sessions: readonly PlanSessionDto[], next: PlanSessionDto) => sessions.map((s) => (s.id === next.id ? next : s));

/** The same session with one drill checked or unchecked, for an optimistic update before the server answers. */
export const withItemCompleted = (s: PlanSessionDto, itemId: string, completed: boolean, now = new Date().toISOString()): PlanSessionDto => {
	const items = s.items.map((i) => (i.id === itemId ? { ...i, completedAt: completed ? (i.completedAt ?? now) : null } : i));
	const done = items.length > 0 && items.every((i) => i.completedAt !== null);
	return { ...s, items, completedAt: done ? (s.completedAt ?? now) : null };
};

export interface PhaseGroup {
	/** Phase id, or `other` for sessions that fall in no phase. */
	readonly id: string;
	readonly title: string;
	readonly description: string;
	readonly measure: string | null;
	readonly fromLesson: number | null;
	readonly toLesson: number | null;
	/** In plan order. Today's session is left out (the page shows it on top) but still counts in `total` and `done`. */
	readonly sessions: readonly PlanSessionDto[];
	readonly total: number;
	readonly done: number;
	/** First and last `YYYY-MM-DD` of the phase's sessions. */
	readonly firstDay: string | null;
	readonly lastDay: string | null;
	readonly current: boolean;
	/** One of the phase's sessions is today's (it is shown at the top of the page, not inside the phase). */
	readonly hasToday: boolean;
}

/**
 * Splits sessions by the plan's phases (lesson number within a phase's range). The current phase holds today's lesson,
 * else the next unfinished one after today, else the earliest unfinished; with nothing left, none is current. Sessions with
 * no lesson number, or outside every phase, go in a neutral `other` group at the end. Empty groups are dropped.
 */
export const groupByPhase = (
	sessions: readonly PlanSessionDto[],
	lessonBySession: Readonly<Record<string, number>>,
	phases: readonly PhaseDto[],
	today: string
): PhaseGroup[] => {
	const ordered = [...sessions].sort((a, b) => a.scheduledOn.localeCompare(b.scheduledOn) || (lessonBySession[a.id] ?? 0) - (lessonBySession[b.id] ?? 0));
	const planned = ordered.filter((s) => lessonBySession[s.id] !== undefined);
	const focus = planned.find((s) => s.scheduledOn === today) ?? planned.find((s) => s.completedAt === null && s.scheduledOn > today) ?? planned.find((s) => s.completedAt === null);
	const focusPhase = focus ? phaseForLesson(phases, lessonBySession[focus.id]!) : undefined;

	const build = (id: string, meta: Pick<PhaseGroup, 'title' | 'description' | 'measure' | 'fromLesson' | 'toLesson'>, all: readonly PlanSessionDto[], current: boolean): PhaseGroup => ({
		id,
		...meta,
		sessions: all.filter((s) => s.scheduledOn !== today),
		total: all.length,
		done: all.filter((s) => isFinished(s) || s.completedAt !== null).length,
		firstDay: all[0]?.scheduledOn ?? null,
		lastDay: all.at(-1)?.scheduledOn ?? null,
		current,
		hasToday: all.some((s) => s.scheduledOn === today)
	});

	const groups = phases.map((p) =>
		build(p.id, { title: p.title, description: p.description, measure: p.measure, fromLesson: p.fromLesson, toLesson: p.toLesson }, ordered.filter((s) => {
			const n = lessonBySession[s.id];
			return n !== undefined && phaseForLesson(phases, n)?.id === p.id;
		}), p.id === focusPhase?.id)
	);
	const rest = ordered.filter((s) => {
		const n = lessonBySession[s.id];
		return n === undefined || !phaseForLesson(phases, n);
	});
	if (rest.length > 0) groups.push(build('other', { title: 'Other sessions', description: '', measure: null, fromLesson: null, toLesson: null }, rest, !focusPhase && rest.some((s) => s.scheduledOn >= today)));
	return groups.filter((g) => g.total > 0);
};

/** `Oct 28 - Nov 26`, or one day when they are the same. */
export const formatRange = (first: string, last: string, locale?: string) => {
	const short = (iso: string) => {
		const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
		return new Date(y, m - 1, d).toLocaleDateString(locale, { month: 'short', day: 'numeric' });
	};
	return first === last ? short(first) : `${short(first)} - ${short(last)}`;
};
