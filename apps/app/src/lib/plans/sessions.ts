/** Pure helpers for the player's `/plans` view: what is today, what is next, what is behind. */
import type { PlanSessionDto } from '@ttg/shared';

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
		upcoming: sessions.filter((s) => s.scheduledOn > today).sort(byDate),
		earlier: sessions.filter((s) => s.scheduledOn < today).sort((a, b) => byDate(b, a))
	};
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
