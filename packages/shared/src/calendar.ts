import { Schema } from 'effect';
import { Uuid } from './analyses';
import type { LoggedSessionDto } from './logged-sessions';
import type { SessionTag } from './session-tags';

/** Check-ins and assessments (spec 3.F.2): short self-reports and coach-defined measurable tests. */

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const IsoDate = Schema.String.pipe(Schema.check(Schema.isPattern(DATE_PATTERN)));

export const MAX_CHECKIN_REPEAT_WEEKS = 12;
export const MAX_CHECKIN_ISSUES = 1000;

/** `POST /api/check-ins` (coach): schedule a check-in for a player, optionally repeating weekly. */
export const ScheduleCheckInRequest = Schema.Struct({
	playerId: Uuid,
	scheduledOn: IsoDate,
	/** Extra weekly check-ins after the first (0 = just one). */
	repeatWeeks: Schema.optional(Schema.Number.pipe(Schema.check(Schema.isInt(), Schema.isBetween({ minimum: 0, maximum: MAX_CHECKIN_REPEAT_WEEKS }))))
});
export type ScheduleCheckInRequest = typeof ScheduleCheckInRequest.Type;

/** What a player reports: rounds played, anything that went wrong, how confident they feel, and an optional video. */
export const CheckInAnswers = Schema.Struct({
	roundsPlayed: Schema.Number.pipe(Schema.check(Schema.isInt(), Schema.isBetween({ minimum: 0, maximum: 30 }))),
	issues: Schema.optional(Schema.String.pipe(Schema.check(Schema.isMaxLength(MAX_CHECKIN_ISSUES)))),
	confidence: Schema.Number.pipe(Schema.check(Schema.isInt(), Schema.isBetween({ minimum: 1, maximum: 5 }))),
	videoId: Schema.optional(Uuid)
});
export type CheckInAnswers = typeof CheckInAnswers.Type;

/** `PATCH /api/check-ins/:id` (player): submit the answers. */
export const SubmitCheckInRequest = Schema.Struct({ answers: CheckInAnswers });
export type SubmitCheckInRequest = typeof SubmitCheckInRequest.Type;

/** `POST /api/check-ins/log` (player): log a check-in of your own for a past day or today, already submitted. */
export const LogCheckInRequest = Schema.Struct({ date: IsoDate, answers: CheckInAnswers });
export type LogCheckInRequest = typeof LogCheckInRequest.Type;

export interface CheckInDto {
	readonly id: string;
	readonly playerId: string;
	readonly scheduledOn: string;
	readonly answers: CheckInAnswers | null;
	readonly submittedAt: string | null;
}

export const CreateAssessmentRequest = Schema.Struct({
	name: Schema.String.pipe(Schema.check(Schema.isMinLength(1), Schema.isMaxLength(80))),
	description: Schema.optional(Schema.String.pipe(Schema.check(Schema.isMaxLength(1000)))),
	unit: Schema.optional(Schema.String.pipe(Schema.check(Schema.isMaxLength(20))))
});
export type CreateAssessmentRequest = typeof CreateAssessmentRequest.Type;

export interface AssessmentDto {
	readonly id: string;
	readonly name: string;
	readonly description: string | null;
	readonly unit: string | null;
}

/** `POST /api/assessments/:id/schedule` (coach). */
export const ScheduleAssessmentRequest = Schema.Struct({ playerId: Uuid, scheduledOn: IsoDate });
export type ScheduleAssessmentRequest = typeof ScheduleAssessmentRequest.Type;

/** `POST /api/assessments/:id/results` (coach): record a value, for a scheduled test (`resultId`) or ad hoc. */
export const RecordResultRequest = Schema.Struct({
	playerId: Uuid,
	value: Schema.Number.pipe(Schema.check(Schema.isFinite(), Schema.isBetween({ minimum: -1_000_000, maximum: 1_000_000 }))),
	resultId: Schema.optional(Uuid)
});
export type RecordResultRequest = typeof RecordResultRequest.Type;

export type Trend = 'up' | 'down' | 'same';

export interface AssessmentResultDto {
	readonly id: string;
	readonly assessmentId: string;
	readonly name: string;
	readonly unit: string | null;
	/** The calendar day: the scheduled day, or the day it was recorded for an ad-hoc result. */
	readonly date: string;
	/** Null while the test is scheduled and has no result yet. */
	readonly value: number | null;
	readonly recordedAt: string | null;
	/** The player's previous recorded result of the same test, to read the trend against. */
	readonly previousValue: number | null;
	readonly change: number | null;
	readonly trend: Trend | null;
}

/** Trend of a new value against the previous one (null when there is nothing to compare with). */
export const trendOf = (value: number | null, previous: number | null): { change: number | null; trend: Trend | null } => {
	if (value === null || previous === null) return { change: null, trend: null };
	const change = Math.round((value - previous) * 1e6) / 1e6 + 0; // `+ 0` turns -0 into 0
	return { change, trend: change > 0 ? 'up' : change < 0 ? 'down' : 'same' };
};

/** One thing on a player's calendar. */
/** `logged` is an extra session the player logged themselves (not on the plan). */
export type CalendarKind = 'session' | 'checkin' | 'assessment' | 'logged';
export interface CalendarItem {
	readonly kind: CalendarKind;
	readonly id: string;
	/** `YYYY-MM-DD`. */
	readonly date: string;
	readonly title: string;
	/** `done` for a finished session, a submitted check-in or a recorded result; otherwise `open`. */
	readonly status: 'open' | 'done';
	/** A short line under the title ("30 min", "Confidence 4 of 5", "42 yd"). */
	readonly detail: string | null;
	/** Content tags of a planned or logged session. */
	readonly tags?: readonly SessionTag[];
	/** Drill names of a planned session, in order (the hover card shows the first few). */
	readonly drills?: readonly string[];
}

/** A logged extra session as a calendar item. It carries the notes and video for a detail view; plan progress never reads it. */
export interface LoggedCalendarItem extends CalendarItem {
	readonly kind: 'logged';
	readonly status: 'done';
	readonly tags: readonly SessionTag[];
	readonly notes: string | null;
	readonly videoId: string | null;
}

/** Logged extras as calendar items, in the order the API gives them. */
export const buildLoggedCalendarItems = (logged: readonly LoggedSessionDto[] | undefined): LoggedCalendarItem[] =>
	(logged ?? []).map((l) => ({
		kind: 'logged',
		id: l.id,
		date: l.date,
		title: l.workedOn?.trim() ? l.workedOn.trim().slice(0, 60) : 'Extra session',
		status: 'done',
		detail: l.minutes ? `${l.minutes} min` : null,
		tags: l.tags,
		notes: l.notes,
		videoId: l.video?.id ?? null
	}));

/** The pieces of a calendar, as the API returns them (`GET /api/calendar`). */
export interface CalendarData {
	readonly sessions: readonly {
		readonly id: string;
		readonly title: string | null;
		readonly planTitle: string | null;
		readonly scheduledOn: string;
		readonly durationMin: number | null;
		readonly completedAt: string | null;
		readonly items: readonly { readonly completedAt: string | null; readonly name?: string }[];
		readonly tags?: readonly SessionTag[];
	}[];
	/** Logged extra sessions (not part of the plan). Absent in older payloads. */
	readonly logged?: readonly LoggedSessionDto[];
	readonly checkIns: readonly CheckInDto[];
	readonly results: readonly AssessmentResultDto[];
}

const trim = (n: number) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100));

/** Everything on the calendar as one flat list, sorted by day (sessions, logged sessions, check-ins, then tests within a day). */
export const buildCalendarItems = (data: CalendarData): CalendarItem[] => {
	const items: CalendarItem[] = [
		...data.sessions.map((s): CalendarItem => {
			const done = s.items.filter((i) => i.completedAt).length;
			return {
				kind: 'session',
				id: s.id,
				date: s.scheduledOn,
				title: s.title ?? s.planTitle ?? 'Practice session',
				status: s.completedAt ? 'done' : 'open',
				detail: `${s.durationMin ?? '?'} min${s.items.length > 0 && !s.completedAt ? ` · ${done} of ${s.items.length} drills` : ''}`,
				...(s.tags && s.tags.length > 0 ? { tags: s.tags } : {}),
				...(s.items.some((i) => i.name) ? { drills: s.items.flatMap((i) => (i.name ? [i.name] : [])) } : {})
			};
		}),
		...buildLoggedCalendarItems(data.logged),
		...data.checkIns.map((c): CalendarItem => ({
			kind: 'checkin',
			id: c.id,
			date: c.scheduledOn,
			title: 'Check-in',
			status: c.submittedAt ? 'done' : 'open',
			detail: c.answers ? `Confidence ${c.answers.confidence} of 5` : 'To fill in'
		})),
		...data.results.map((r): CalendarItem => ({
			kind: 'assessment',
			id: r.id,
			date: r.date,
			title: r.name,
			status: r.value === null ? 'open' : 'done',
			detail: r.value === null ? 'Scheduled' : `${trim(r.value)}${r.unit ? ` ${r.unit}` : ''}`
		}))
	];
	const order: Record<CalendarKind, number> = { session: 0, logged: 1, checkin: 2, assessment: 3 };
	return items.sort((a, b) => (a.date === b.date ? order[a.kind] - order[b.kind] : a.date < b.date ? -1 : 1));
};
