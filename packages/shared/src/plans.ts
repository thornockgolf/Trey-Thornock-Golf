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

export const PlanStructure = Schema.Struct({
	v: Schema.Literal(1),
	sessions: Schema.Array(PlanSession).pipe(Schema.check(Schema.isMinLength(1), Schema.isMaxLength(MAX_PLAN_SESSIONS)))
});
export type PlanStructure = typeof PlanStructure.Type;

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
	readonly structure: PlanStructure;
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
