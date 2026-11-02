import { Schema } from 'effect';
import { Uuid } from './analyses';
import { addDays } from './plans';
import { SessionTag } from './session-tags';

/**
 * Logged sessions: practice a player did that is not on their plan. Same content tags as planned sessions, but they
 * never advance plan progress. The date is the player's local calendar date (a `date`, not an instant).
 */

export const MAX_LOGGED_NOTES = 2000;
export const MAX_LOGGED_WORKED_ON = 500;
export const MAX_LOGGED_DRILLS = 10;
export const MAX_LOGGED_MINUTES = 600;
/** How far back a log may be dated. */
export const MAX_LOGGED_DAYS_BACK = 366;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const IsoDate = Schema.String.pipe(Schema.check(Schema.isPattern(DATE_PATTERN)));
const Text = (max: number) => Schema.String.pipe(Schema.check(Schema.isMaxLength(max)));
const Tags = Schema.Array(SessionTag).pipe(Schema.check(Schema.isMaxLength(3)));
const Minutes = Schema.Number.pipe(Schema.check(Schema.isInt(), Schema.isBetween({ minimum: 1, maximum: MAX_LOGGED_MINUTES })));
const DrillIds = Schema.Array(Uuid).pipe(Schema.check(Schema.isMaxLength(MAX_LOGGED_DRILLS)));

/** `POST /api/logged-sessions` (player). */
export const CreateLoggedSessionRequest = Schema.Struct({
	date: IsoDate,
	tags: Schema.optional(Tags),
	minutes: Schema.optional(Minutes),
	workedOn: Schema.optional(Text(MAX_LOGGED_WORKED_ON)),
	drillIds: Schema.optional(DrillIds),
	notes: Schema.optional(Text(MAX_LOGGED_NOTES)),
	/** A video the player already uploaded (their own). */
	videoId: Schema.optional(Uuid)
});
export type CreateLoggedSessionRequest = typeof CreateLoggedSessionRequest.Type;

/** `PATCH /api/logged-sessions/:id` (player, own only). Omitted fields stay; `null` clears minutes, text or the video. */
export const UpdateLoggedSessionRequest = Schema.Struct({
	date: Schema.optional(IsoDate),
	tags: Schema.optional(Tags),
	minutes: Schema.optional(Schema.NullOr(Minutes)),
	workedOn: Schema.optional(Schema.NullOr(Text(MAX_LOGGED_WORKED_ON))),
	drillIds: Schema.optional(DrillIds),
	notes: Schema.optional(Schema.NullOr(Text(MAX_LOGGED_NOTES))),
	videoId: Schema.optional(Schema.NullOr(Uuid))
});
export type UpdateLoggedSessionRequest = typeof UpdateLoggedSessionRequest.Type;

export interface LoggedSessionDto {
	readonly id: string;
	readonly playerId: string;
	/** `YYYY-MM-DD`. */
	readonly date: string;
	readonly tags: readonly SessionTag[];
	readonly minutes: number | null;
	readonly workedOn: string | null;
	readonly drills: readonly { readonly id: string; readonly name: string }[];
	readonly notes: string | null;
	/** The linked video; `status` shows whether it is still processing. */
	readonly video: { readonly id: string; readonly status: 'pending' | 'uploaded' | 'processing' | 'ready' | 'failed'; readonly title: string | null } | null;
	readonly createdAt: string;
}

/** Why a log is empty (no tag, no text, no drill), or null when it has something in it. */
export const emptyLogProblem = (log: { tags?: readonly unknown[] | null; workedOn?: string | null; notes?: string | null; drillIds?: readonly unknown[] | null }): string | null =>
	(log.tags?.length ?? 0) === 0 && !log.workedOn?.trim() && !log.notes?.trim() && (log.drillIds?.length ?? 0) === 0
		? 'Pick at least one of Mechanical technique, Skill or Situational practice, or write what you worked on'
		: null;

/**
 * Why a date cannot be logged, or null. `todayUtc` is the server's UTC day; the player's local day can be one ahead
 * (UTC+14) or one behind, so the day after UTC today is still accepted and anything later is "in the future".
 */
export const logDateProblem = (date: string, todayUtc: string): string | null => {
	if (addDays(date, 0) === null) return 'That is not a real date';
	if (date > addDays(todayUtc, 1)!) return 'You cannot log a session in the future';
	if (date < addDays(todayUtc, -MAX_LOGGED_DAYS_BACK)!) return 'That date is too far back';
	return null;
};

/** Monday of the week (Mon-Sun) that holds `isoDate`, as `YYYY-MM-DD`. */
export const weekStart = (isoDate: string): string => {
	const d = new Date(`${isoDate}T00:00:00Z`);
	return addDays(isoDate, -((d.getUTCDay() + 6) % 7))!;
};

export interface WeekTally {
	/** Planned sessions scheduled this week, and how many of them are finished. */
	readonly plannedTotal: number;
	readonly plannedDone: number;
	/** Logged extras this week. */
	readonly extra: number;
}

/** "This week" (Mon-Sun around `today`): planned sessions and logged extras counted separately. */
export const weekTally = (
	planned: readonly { scheduledOn: string; completedAt: string | null }[],
	logged: readonly { date: string }[],
	today: string
): WeekTally => {
	const from = weekStart(today);
	const to = addDays(from, 6)!;
	const inWeek = (d: string) => d >= from && d <= to;
	const week = planned.filter((s) => inWeek(s.scheduledOn));
	return { plannedTotal: week.length, plannedDone: week.filter((s) => s.completedAt !== null).length, extra: logged.filter((l) => inWeek(l.date)).length };
};

/** One line for the tally: "3 planned (2 done), 1 extra". */
export const formatTally = (t: WeekTally): string => {
	const planned = t.plannedTotal === 0 ? 'no planned sessions' : `${t.plannedTotal} planned (${t.plannedDone} done)`;
	return `${planned}, ${t.extra === 0 ? 'no extras' : `${t.extra} extra`}`;
};
