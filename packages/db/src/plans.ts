import type { PlanStructure } from '@ttg/shared';
import { randomUUID } from 'node:crypto';
import { Context, Effect, Layer } from 'effect';
import { Db } from './db';
import type { DatabaseError } from './errors';

export interface Drill {
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
	readonly updatedAt: Date;
}

interface DrillRow {
	id: string;
	name: string;
	category: string | null;
	purpose: string | null;
	setup: string | null;
	steps: string[];
	cues: string | null;
	success_criteria: string | null;
	common_mistake: string | null;
	progression: string | null;
	regression: string | null;
	default_minutes: number | null;
	updated_at: Date;
}

const DRILL_COLUMNS =
	'id, name, category, purpose, setup, steps, cues, success_criteria, common_mistake, progression, regression, default_minutes, updated_at';

const toDrill = (r: DrillRow): Drill => ({
	id: r.id,
	name: r.name,
	category: r.category,
	purpose: r.purpose,
	setup: r.setup,
	steps: r.steps,
	cues: r.cues,
	successCriteria: r.success_criteria,
	commonMistake: r.common_mistake,
	progression: r.progression,
	regression: r.regression,
	defaultMinutes: r.default_minutes,
	updatedAt: r.updated_at
});

/** Fields a drill write may set. On update, `undefined` leaves a field as it is. */
export interface DrillFields {
	name?: string;
	category?: string;
	purpose?: string;
	setup?: string;
	steps?: readonly string[];
	cues?: string;
	successCriteria?: string;
	commonMistake?: string;
	progression?: string;
	regression?: string;
	defaultMinutes?: number;
}

/** Result of a write that can hit the unique drill name. */
export type DrillWrite = { readonly _tag: 'Saved'; readonly drill: Drill } | { readonly _tag: 'NameTaken' } | { readonly _tag: 'Missing' };

export class Drills extends Context.Service<
	Drills,
	{
		readonly list: () => Effect.Effect<readonly Drill[], DatabaseError>;
		readonly get: (id: string) => Effect.Effect<Drill | undefined, DatabaseError>;
		/** Which of these ids exist (used to reject plans that reference unknown drills). */
		readonly existing: (ids: readonly string[]) => Effect.Effect<ReadonlySet<string>, DatabaseError>;
		readonly create: (fields: DrillFields & { name: string }) => Effect.Effect<DrillWrite, DatabaseError>;
		readonly update: (id: string, fields: DrillFields) => Effect.Effect<DrillWrite, DatabaseError>;
	}
>()('ttg/db/Drills') {
	static readonly layer = Layer.effect(
		Drills,
		Effect.gen(function* () {
			const db = yield* Db;
			const nameTaken = (name: string, exceptId?: string) =>
				db
					.maybeOne(`select 1 as ok from drills where lower(name) = lower($1) and ($2::uuid is null or id <> $2)`, [name, exceptId ?? null])
					.pipe(Effect.map((r) => r !== undefined));
			return Drills.of({
				list: () => db.query<DrillRow>(`select ${DRILL_COLUMNS} from drills order by name`).pipe(Effect.map((rows) => rows.map(toDrill))),
				get: (id) => db.maybeOne<DrillRow>(`select ${DRILL_COLUMNS} from drills where id = $1`, [id]).pipe(Effect.map((r) => (r ? toDrill(r) : undefined))),
				existing: (ids) =>
					ids.length === 0
						? Effect.succeed(new Set<string>())
						: db.query<{ id: string }>(`select id from drills where id = any($1::uuid[])`, [ids]).pipe(Effect.map((rows) => new Set(rows.map((r) => r.id)))),
				create: (f) =>
					Effect.gen(function* () {
						if (yield* nameTaken(f.name)) return { _tag: 'NameTaken' } as const;
						const row = yield* db.maybeOne<DrillRow>(
							`insert into drills (name, category, purpose, setup, steps, cues, success_criteria, common_mistake, progression, regression, default_minutes)
							 values ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, $10, $11) returning ${DRILL_COLUMNS}`,
							[
								f.name,
								f.category ?? null,
								f.purpose ?? null,
								f.setup ?? null,
								JSON.stringify(f.steps ?? []),
								f.cues ?? null,
								f.successCriteria ?? null,
								f.commonMistake ?? null,
								f.progression ?? null,
								f.regression ?? null,
								f.defaultMinutes ?? null
							]
						);
						return { _tag: 'Saved', drill: toDrill(row!) } as const;
					}),
				update: (id, f) =>
					Effect.gen(function* () {
						if (f.name !== undefined && (yield* nameTaken(f.name, id))) return { _tag: 'NameTaken' } as const;
						const row = yield* db.maybeOne<DrillRow>(
							`update drills set
							   name = coalesce($2, name), category = coalesce($3, category), purpose = coalesce($4, purpose),
							   setup = coalesce($5, setup), steps = coalesce($6::jsonb, steps), cues = coalesce($7, cues),
							   success_criteria = coalesce($8, success_criteria), common_mistake = coalesce($9, common_mistake),
							   progression = coalesce($10, progression), regression = coalesce($11, regression),
							   default_minutes = coalesce($12, default_minutes)
							 where id = $1 returning ${DRILL_COLUMNS}`,
							[
								id,
								f.name ?? null,
								f.category ?? null,
								f.purpose ?? null,
								f.setup ?? null,
								f.steps === undefined ? null : JSON.stringify(f.steps),
								f.cues ?? null,
								f.successCriteria ?? null,
								f.commonMistake ?? null,
								f.progression ?? null,
								f.regression ?? null,
								f.defaultMinutes ?? null
							]
						);
						return row ? ({ _tag: 'Saved', drill: toDrill(row) } as const) : ({ _tag: 'Missing' } as const);
					})
			});
		})
	);
}

export interface PracticePlan {
	readonly id: string;
	readonly authorId: string;
	readonly title: string;
	readonly structure: PlanStructure;
	readonly createdAt: Date;
	readonly updatedAt: Date;
}

interface PlanRow {
	id: string;
	author_id: string;
	title: string;
	structure: PlanStructure;
	created_at: Date;
	updated_at: Date;
}

const PLAN_COLUMNS = 'id, author_id, title, structure, created_at, updated_at';

const toPlan = (r: PlanRow): PracticePlan => ({
	id: r.id,
	authorId: r.author_id,
	title: r.title,
	structure: r.structure,
	createdAt: r.created_at,
	updatedAt: r.updated_at
});

export interface SessionItem {
	readonly id: string;
	readonly drillId: string;
	readonly name: string;
	readonly minutes: number;
	readonly completedAt: string | null;
}

export interface PlanSessionRow {
	readonly id: string;
	readonly assignmentId: string;
	readonly title: string | null;
	/** `YYYY-MM-DD`. */
	readonly scheduledOn: string;
	readonly durationMin: number | null;
	readonly items: readonly SessionItem[];
	readonly completedAt: Date | null;
	/** The plan's title, when the query joined it. */
	readonly planTitle: string | null;
}

export interface PlanAssignment {
	readonly id: string;
	readonly planId: string;
	readonly playerId: string;
	readonly startsOn: string;
	readonly status: 'active' | 'completed' | 'cancelled';
	readonly sessions: readonly PlanSessionRow[];
}

export type AssignResult =
	| { readonly _tag: 'Assigned'; readonly assignment: PlanAssignment }
	| { readonly _tag: 'NotPaired' }
	| { readonly _tag: 'PlanMissing' };

interface AssignmentRow {
	id: string;
	plan_id: string;
	player_id: string;
	starts_on: string;
	status: PlanAssignment['status'];
}

interface SessionRowData {
	id: string;
	assignment_id: string;
	title: string | null;
	scheduled_on: string;
	duration_min: number | null;
	items: SessionItem[];
	completed_at: Date | null;
	plan_title?: string | null;
}

const toSession = (r: SessionRowData): PlanSessionRow => ({
	id: r.id,
	assignmentId: r.assignment_id,
	title: r.title,
	scheduledOn: r.scheduled_on,
	durationMin: r.duration_min,
	items: r.items,
	completedAt: r.completed_at,
	planTitle: r.plan_title ?? null
});

const SESSION_SELECT = `s.id, s.assignment_id, s.title, s.scheduled_on::text as scheduled_on, s.duration_min, s.items, s.completed_at, p.title as plan_title
	from plan_sessions s
	join plan_assignments a on a.id = s.assignment_id
	join practice_plans p on p.id = a.plan_id`;

/** Result of changing one drill's completion on a session. */
export type ItemCompletion = { readonly _tag: 'Updated'; readonly session: PlanSessionRow } | { readonly _tag: 'Missing' };

export class Plans extends Context.Service<
	Plans,
	{
		/** Newest first. */
		readonly list: () => Effect.Effect<readonly PracticePlan[], DatabaseError>;
		readonly get: (id: string) => Effect.Effect<PracticePlan | undefined, DatabaseError>;
		readonly create: (input: { authorId: string; title: string; structure: PlanStructure }) => Effect.Effect<PracticePlan, DatabaseError>;
		readonly update: (id: string, input: { title?: string; structure?: PlanStructure }) => Effect.Effect<PracticePlan | undefined, DatabaseError>;
		/**
		 * Assign a plan to a player in one transaction: the assignment, one dated session per plan session (items copied
		 * with the drill's name, so later plan or drill edits do not change what the player was given), and a
		 * `plan_assigned` notification. `dates[i]` is the day of session i. `NotPaired` when the coach has no active
		 * assignment with the player; `PlanMissing` when the plan does not exist.
		 */
		/** A player's sessions on active assignments, by date. */
		readonly listSessionsForPlayer: (playerId: string) => Effect.Effect<readonly PlanSessionRow[], DatabaseError>;
		/**
		 * The player's active assignment with the latest `starts_on` (ties: newest), its plan's structure, and its sessions
		 * ordered by (scheduled_on, created_at, id). Undefined when there is none.
		 */
		readonly activeAssignmentForPlayer: (playerId: string) => Effect.Effect<
			{ readonly id: string; readonly planId: string; readonly startsOn: string; readonly planTitle: string; readonly structure: PlanStructure; readonly sessions: readonly PlanSessionRow[] } | undefined,
			DatabaseError
		>;
		/**
		 * Mark one drill of a player's own session done (or not done). The session is complete once every drill is. A
		 * session or drill that is not the player's is `Missing`.
		 */
		readonly setItemCompleted: (input: {
			playerId: string;
			sessionId: string;
			itemId: string;
			completed: boolean;
		}) => Effect.Effect<ItemCompletion, DatabaseError>;
		/** Whether a drill appears in any of the player's sessions (lets a player read just those drills). */
		readonly playerHasDrill: (playerId: string, drillId: string) => Effect.Effect<boolean, DatabaseError>;
		readonly assign: (input: {
			planId: string;
			coachId: string;
			playerId: string;
			startsOn: string;
			dates: readonly string[];
		}) => Effect.Effect<AssignResult, DatabaseError>;
	}
>()('ttg/db/Plans') {
	static readonly layer = Layer.effect(
		Plans,
		Effect.gen(function* () {
			const db = yield* Db;
			return Plans.of({
				list: () => db.query<PlanRow>(`select ${PLAN_COLUMNS} from practice_plans order by created_at desc`).pipe(Effect.map((rows) => rows.map(toPlan))),
				get: (id) => db.maybeOne<PlanRow>(`select ${PLAN_COLUMNS} from practice_plans where id = $1`, [id]).pipe(Effect.map((r) => (r ? toPlan(r) : undefined))),
				create: (i) =>
					db
						.maybeOne<PlanRow>(`insert into practice_plans (author_id, title, structure) values ($1, $2, $3::jsonb) returning ${PLAN_COLUMNS}`, [
							i.authorId,
							i.title,
							JSON.stringify(i.structure)
						])
						.pipe(Effect.map((r) => toPlan(r!))),
				update: (id, i) =>
					db
						.maybeOne<PlanRow>(
							`update practice_plans set title = coalesce($2, title), structure = coalesce($3::jsonb, structure)
							 where id = $1 returning ${PLAN_COLUMNS}`,
							[id, i.title ?? null, i.structure ? JSON.stringify(i.structure) : null]
						)
						.pipe(Effect.map((r) => (r ? toPlan(r) : undefined))),
				listSessionsForPlayer: (playerId) =>
					db
						.query<SessionRowData>(
							`select ${SESSION_SELECT} where a.player_id = $1 and a.status = 'active' order by s.scheduled_on, s.created_at`,
							[playerId]
						)
						.pipe(Effect.map((rows) => rows.map(toSession))),
				activeAssignmentForPlayer: (playerId) =>
					Effect.gen(function* () {
						const a = yield* db.maybeOne<AssignmentRow & { plan_title: string; structure: PlanStructure }>(
							`select a.id, a.plan_id, a.player_id, a.starts_on::text as starts_on, a.status, p.title as plan_title, p.structure
							 from plan_assignments a join practice_plans p on p.id = a.plan_id
							 where a.player_id = $1 and a.status = 'active' order by a.starts_on desc, a.created_at desc limit 1`,
							[playerId]
						);
						if (!a) return undefined;
						const rows = yield* db.query<SessionRowData>(`select ${SESSION_SELECT} where s.assignment_id = $1 order by s.scheduled_on, s.created_at, s.id`, [a.id]);
						return { id: a.id, planId: a.plan_id, startsOn: a.starts_on, planTitle: a.plan_title, structure: a.structure, sessions: rows.map(toSession) };
					}),
				setItemCompleted: (i) =>
					db.transaction((tx) =>
						Effect.gen(function* () {
							// Lock the session so two taps on different drills cannot overwrite each other.
							const row = yield* tx.maybeOne<SessionRowData>(
								`select ${SESSION_SELECT} where s.id = $1 and a.player_id = $2 for update of s`,
								[i.sessionId, i.playerId]
							);
							if (!row || !row.items.some((x) => x.id === i.itemId)) return { _tag: 'Missing' } as const;
							const now = new Date().toISOString();
							const items = row.items.map((x) =>
								x.id !== i.itemId ? x : { ...x, completedAt: i.completed ? (x.completedAt ?? now) : null }
							);
							const done = items.every((x) => x.completedAt !== null);
							yield* tx.query(
								`update plan_sessions set items = $2::jsonb, completed_at = case when $3 then coalesce(completed_at, now()) else null end where id = $1`,
								[i.sessionId, JSON.stringify(items), done]
							);
							const updated = (yield* tx.maybeOne<SessionRowData>(`select ${SESSION_SELECT} where s.id = $1`, [i.sessionId]))!;
							return { _tag: 'Updated', session: toSession(updated) } as const;
						})
					),
				playerHasDrill: (playerId, drillId) =>
					db
						.maybeOne(
							`select 1 as ok from plan_sessions s join plan_assignments a on a.id = s.assignment_id
							 where a.player_id = $1 and s.items @> jsonb_build_array(jsonb_build_object('drillId', $2::text)) limit 1`,
							[playerId, drillId]
						)
						.pipe(Effect.map((r) => r !== undefined)),
				assign: (i) =>
					db.transaction((tx) =>
						Effect.gen(function* () {
							const paired = yield* tx.maybeOne(
								`select 1 as ok from coach_assignments where coach_id = $1 and player_id = $2 and status = 'active'`,
								[i.coachId, i.playerId]
							);
							if (!paired) return { _tag: 'NotPaired' } as const;
							const plan = yield* tx.maybeOne<PlanRow>(`select ${PLAN_COLUMNS} from practice_plans where id = $1`, [i.planId]);
							if (!plan) return { _tag: 'PlanMissing' } as const;

							const drillIds = [...new Set(plan.structure.sessions.flatMap((s) => s.items.map((x) => x.drillId)))];
							const names = new Map(
								(yield* tx.query<{ id: string; name: string }>(`select id, name from drills where id = any($1::uuid[])`, [drillIds])).map((d) => [d.id, d.name])
							);

							const assignment = (yield* tx.maybeOne<AssignmentRow>(
								`insert into plan_assignments (plan_id, player_id, starts_on) values ($1, $2, $3::date)
								 returning id, plan_id, player_id, starts_on::text as starts_on, status`,
								[i.planId, i.playerId, i.startsOn]
							))!;

							const sessions: PlanSessionRow[] = [];
							for (const [n, s] of plan.structure.sessions.entries()) {
								const items: SessionItem[] = s.items.map((x) => ({
									id: randomUUID(),
									drillId: x.drillId,
									name: names.get(x.drillId) ?? 'Drill',
									minutes: x.minutes,
									completedAt: null
								}));
								const row = (yield* tx.maybeOne<SessionRowData>(
									`insert into plan_sessions (assignment_id, title, scheduled_on, duration_min, items) values ($1, $2, $3::date, $4, $5::jsonb)
									 returning id, assignment_id, title, scheduled_on::text as scheduled_on, duration_min, items, completed_at`,
									[assignment.id, s.title, i.dates[n], s.durationMin, JSON.stringify(items)]
								))!;
								sessions.push({ ...toSession(row), planTitle: plan.title });
							}

							yield* tx.query(`insert into notifications (user_id, type, payload) values ($1, 'plan_assigned', $2::jsonb)`, [
								i.playerId,
								JSON.stringify({ assignmentId: assignment.id, planId: plan.id, planTitle: plan.title, startsOn: i.startsOn })
							]);

							return {
								_tag: 'Assigned',
								assignment: {
									id: assignment.id,
									planId: assignment.plan_id,
									playerId: assignment.player_id,
									startsOn: assignment.starts_on,
									status: assignment.status,
									sessions
								}
							} as const;
						})
					)
			});
		})
	);
}
