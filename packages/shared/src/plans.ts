import { Schema } from 'effect';

/**
 * Drills and practice plans (spec 3.F.2). A plan's `structure` is stored as JSON in `practice_plans.structure`:
 * ordered sessions, each a fixed length with drills and the minutes spent on each. Drill minutes must add up to the
 * session length exactly (parity with the legacy verifier in `index-trey-website.html`).
 */

/** The only session lengths a plan may use, in minutes. */
export const SESSION_LENGTHS = [30, 45, 60, 90] as const;
export type SessionLength = (typeof SESSION_LENGTHS)[number];

export const MAX_PLAN_SESSIONS = 60;
export const MAX_ITEMS_PER_SESSION = 20;
export const MAX_DRILL_TEXT = 2000;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const Uuid = Schema.String.pipe(Schema.check(Schema.isPattern(UUID_PATTERN)));
const Text = (max = MAX_DRILL_TEXT) => Schema.String.pipe(Schema.check(Schema.isMaxLength(max)));
const Name = Schema.String.pipe(Schema.check(Schema.isMinLength(1), Schema.isMaxLength(120)));

export const PlanItem = Schema.Struct({
	drillId: Uuid,
	minutes: Schema.Number.pipe(Schema.check(Schema.isInt(), Schema.isBetween({ minimum: 1, maximum: 90 })))
});
export type PlanItem = typeof PlanItem.Type;

export const PlanSession = Schema.Struct({
	title: Name,
	durationMin: Schema.Literals(SESSION_LENGTHS),
	items: Schema.Array(PlanItem).pipe(Schema.check(Schema.isMinLength(1), Schema.isMaxLength(MAX_ITEMS_PER_SESSION)))
});
export type PlanSession = typeof PlanSession.Type;

export const MAX_PLAN_PHASES = 12;

/**
 * A phase of the roadmap: a run of lessons (sessions, 1-based, inclusive) with a title and Trey's "why it matters".
 * Phases live inside the plan's `structure` JSON (`phases`), so no table is needed.
 */
export const PlanPhase = Schema.Struct({
	id: Schema.String.pipe(Schema.check(Schema.isMinLength(1), Schema.isMaxLength(40))),
	title: Schema.String.pipe(Schema.check(Schema.isMinLength(1), Schema.isMaxLength(80))),
	description: Text(600),
	measure: Schema.optional(Text(200)),
	fromLesson: Schema.Number.pipe(Schema.check(Schema.isInt(), Schema.isBetween({ minimum: 1, maximum: MAX_PLAN_SESSIONS }))),
	toLesson: Schema.Number.pipe(Schema.check(Schema.isInt(), Schema.isBetween({ minimum: 1, maximum: MAX_PLAN_SESSIONS })))
});
export type PlanPhase = typeof PlanPhase.Type;

export const PlanStructure = Schema.Struct({
	v: Schema.Literal(1),
	sessions: Schema.Array(PlanSession).pipe(Schema.check(Schema.isMinLength(1), Schema.isMaxLength(MAX_PLAN_SESSIONS))),
	/** Optional on input and in old rows; the API always returns an array. */
	phases: Schema.optional(Schema.Array(PlanPhase).pipe(Schema.check(Schema.isMaxLength(MAX_PLAN_PHASES))))
});
export type PlanStructure = typeof PlanStructure.Type;

/** Human-readable problems with a plan's phases (empty when fine): from > to, past the last lesson, unordered, overlapping, duplicate ids. */
export const phaseIssues = (structure: PlanStructure): string[] => {
	const phases = structure.phases ?? [];
	const issues: string[] = [];
	const total = structure.sessions.length;
	const ids = new Set<string>();
	phases.forEach((p, i) => {
		if (ids.has(p.id)) issues.push(`phase "${p.title}" repeats an id`);
		ids.add(p.id);
		if (p.fromLesson > p.toLesson) issues.push(`phase "${p.title}" starts after it ends`);
		if (p.toLesson > total) issues.push(`phase "${p.title}" goes past lesson ${total}`);
		const prev = phases[i - 1];
		if (prev && p.fromLesson <= prev.toLesson) issues.push(`phase "${p.title}" overlaps or is out of order after "${prev.title}"`);
	});
	return issues;
};

/** Trimmed copy with `phases` always an array, as the API returns it. */
export const withPhases = (structure: PlanStructure): PlanStructure & { readonly phases: readonly PlanPhase[] } => ({
	...structure,
	phases: structure.phases ?? []
});

/** Sessions whose drill minutes do not add up to the session length, as `{ index, title, expected, actual }`. */
export const sessionTotalIssues = (structure: PlanStructure) =>
	structure.sessions.flatMap((s, index) => {
		const actual = s.items.reduce((n, i) => n + i.minutes, 0);
		return actual === s.durationMin ? [] : [{ index, title: s.title, expected: s.durationMin, actual }];
	});

/** Every drill id a plan uses, once. */
export const drillIdsOf = (structure: PlanStructure) => [...new Set(structure.sessions.flatMap((s) => s.items.map((i) => i.drillId)))];

const Steps = Schema.Array(Text(500)).pipe(Schema.check(Schema.isMaxLength(20)));

const drillFields = {
	category: Schema.optional(Text(80)),
	purpose: Schema.optional(Text()),
	setup: Schema.optional(Text()),
	steps: Schema.optional(Steps),
	cues: Schema.optional(Text()),
	successCriteria: Schema.optional(Text()),
	commonMistake: Schema.optional(Text()),
	progression: Schema.optional(Text()),
	regression: Schema.optional(Text()),
	defaultMinutes: Schema.optional(Schema.Number.pipe(Schema.check(Schema.isInt(), Schema.isBetween({ minimum: 1, maximum: 90 }))))
};

export const CreateDrillRequest = Schema.Struct({ name: Name, ...drillFields });
export type CreateDrillRequest = typeof CreateDrillRequest.Type;

export const UpdateDrillRequest = Schema.Struct({ name: Schema.optional(Name), ...drillFields });
export type UpdateDrillRequest = typeof UpdateDrillRequest.Type;

export const CreatePlanRequest = Schema.Struct({ title: Name, structure: PlanStructure });
export type CreatePlanRequest = typeof CreatePlanRequest.Type;

export const UpdatePlanRequest = Schema.Struct({ title: Schema.optional(Name), structure: Schema.optional(PlanStructure) });
export type UpdatePlanRequest = typeof UpdatePlanRequest.Type;

export interface DrillDto {
	readonly id: string;
	readonly name: string;
	readonly category: string | null;
	readonly purpose: string | null;
	readonly setup: string | null;
	readonly steps: readonly string[];
	readonly cues: string | null;
	readonly successCriteria: string | null;
	readonly commonMistake: string | null;
	readonly progression: string | null;
	readonly regression: string | null;
	readonly defaultMinutes: number | null;
	readonly updatedAt: string;
}

export interface PlanDto {
	readonly id: string;
	readonly authorId: string;
	readonly title: string;
	readonly structure: PlanStructure & { readonly phases: readonly PlanPhase[] };
	readonly createdAt: string;
	readonly updatedAt: string;
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
export const MAX_SPACING_DAYS = 14;

/** `POST /api/plans/:id/assign`: sessions land on `startsOn`, then every `spacingDays` days (default: every day). */
export const AssignPlanRequest = Schema.Struct({
	playerId: Uuid,
	startsOn: Schema.String.pipe(Schema.check(Schema.isPattern(DATE_PATTERN))),
	spacingDays: Schema.optional(Schema.Number.pipe(Schema.check(Schema.isInt(), Schema.isBetween({ minimum: 1, maximum: MAX_SPACING_DAYS }))))
});
export type AssignPlanRequest = typeof AssignPlanRequest.Type;

/** `YYYY-MM-DD` plus whole days, in UTC so the result never shifts with the server's timezone. Null if not a real date. */
export const addDays = (isoDate: string, days: number): string | null => {
	if (!DATE_PATTERN.test(isoDate)) return null;
	const d = new Date(`${isoDate}T00:00:00Z`);
	if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== isoDate) return null;
	d.setUTCDate(d.getUTCDate() + days);
	return d.toISOString().slice(0, 10);
};

/** `PATCH /api/sessions/:id/items/:itemId`: check a drill off, or undo it. */
export const SetItemCompletedRequest = Schema.Struct({ completed: Schema.Boolean });
export type SetItemCompletedRequest = typeof SetItemCompletedRequest.Type;

export interface SessionItemDto {
	readonly id: string;
	readonly drillId: string;
	readonly name: string;
	readonly minutes: number;
	/** Set when the player checks the drill off. */
	readonly completedAt: string | null;
}

export interface PlanSessionDto {
	readonly id: string;
	readonly assignmentId: string;
	readonly title: string | null;
	/** The plan this session came from. */
	readonly planTitle: string | null;
	/** `YYYY-MM-DD`. */
	readonly scheduledOn: string;
	readonly durationMin: number | null;
	readonly items: readonly SessionItemDto[];
	readonly completedAt: string | null;
}

export interface PlanAssignmentDto {
	readonly id: string;
	readonly planId: string;
	readonly playerId: string;
	readonly startsOn: string;
	readonly status: 'active' | 'completed' | 'cancelled';
	readonly sessions: readonly PlanSessionDto[];
}

export type PhaseState = 'done' | 'current' | 'upcoming';

export interface PhaseDto {
	readonly id: string;
	readonly title: string;
	/** Trey's "why it matters". */
	readonly description: string;
	/** How improvement is measured, when he wrote one. */
	readonly measure: string | null;
	/** 1-based, inclusive. */
	readonly fromLesson: number;
	readonly toLesson: number;
}

export interface HomeLessonDto {
	/** 1-based position of `session` in the assignment, by date. */
	readonly number: number;
	readonly total: number;
	readonly completedCount: number;
	readonly session: PlanSessionDto;
	/** The session is today's; false when it is the next upcoming or an overdue one. */
	readonly isToday: boolean;
}

/** Data for the player's Home (`/`). Everything is null or empty for a player with no active plan. */
export interface HomeDto {
	readonly assignment: { readonly id: string; readonly planTitle: string; readonly startsOn: string } | null;
	/** Null with an assignment means every lesson is done. */
	readonly lesson: HomeLessonDto | null;
	readonly phases: readonly (PhaseDto & { readonly state: PhaseState })[];
	readonly currentPhaseId: string | null;
	/** `YYYY-MM-DD` the server used as today (UTC). */
	readonly today: string;
}

const lessonNumbers = <T extends { completedAt: string | null; scheduledOn: string }>(sessions: readonly T[], today: string) => {
	const todays = sessions.findIndex((s) => s.scheduledOn === today);
	if (todays >= 0) return { index: todays, isToday: true };
	const upcoming = sessions.findIndex((s) => s.completedAt === null && s.scheduledOn > today);
	if (upcoming >= 0) return { index: upcoming, isToday: false };
	const overdue = sessions.findIndex((s) => s.completedAt === null);
	return { index: overdue, isToday: false };
};

/**
 * Pure core of Home. `sessions` must already be ordered by (scheduled_on, created_at). Current lesson: today's session,
 * else the next uncompleted one after today, else the earliest uncompleted past one, else none. A phase is `current`
 * when it holds the current lesson number (or the nearest later phase when the lesson falls in a gap), `done` before
 * it, `upcoming` after; with no current lesson (finished) all are done.
 */
export const buildHome = (
	input: { assignment: { id: string; planTitle: string; startsOn: string } | null; sessions: readonly PlanSessionDto[]; phases: readonly PlanPhase[] },
	today: string
): HomeDto => {
	if (!input.assignment) return { assignment: null, lesson: null, phases: [], currentPhaseId: null, today };
	const { sessions } = input;
	const pick = lessonNumbers(sessions, today);
	const completedCount = sessions.filter((s) => s.completedAt !== null).length;
	const lesson: HomeLessonDto | null =
		pick.index >= 0 ? { number: pick.index + 1, total: sessions.length, completedCount, session: sessions[pick.index]!, isToday: pick.isToday } : null;
	const current = lesson?.number ?? null;
	const currentPhase = current === null ? undefined : input.phases.find((p) => current <= p.toLesson);
	const phases = input.phases.map((p) => ({
		id: p.id,
		title: p.title,
		description: p.description,
		measure: p.measure ?? null,
		fromLesson: p.fromLesson,
		toLesson: p.toLesson,
		state: (current === null || p.toLesson < current ? 'done' : p.id === currentPhase?.id ? 'current' : 'upcoming') as PhaseState
	}));
	return { assignment: input.assignment, lesson, phases, currentPhaseId: currentPhase?.id ?? null, today };
};

/**
 * Data for the player's `/plans` page: the sessions plus, when the active plan has phases, those phases and each
 * session's 1-based lesson number (its position in the active assignment, by date). `GET /api/sessions` is unchanged.
 */
export interface PlansPageDto {
	readonly sessions: readonly PlanSessionDto[];
	readonly phases: readonly PhaseDto[];
	/** Session id to lesson number, for sessions of the active assignment only. */
	readonly lessonBySession: Readonly<Record<string, number>>;
}

/** The phase that holds a lesson number, if any. */
export const phaseForLesson = <P extends { fromLesson: number; toLesson: number }>(phases: readonly P[], lesson: number): P | undefined =>
	phases.find((p) => lesson >= p.fromLesson && lesson <= p.toLesson);
