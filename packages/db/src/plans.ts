import type { PlanStructure } from '@ttg/shared';
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

export class Plans extends Context.Service<
	Plans,
	{
		/** Newest first. */
		readonly list: () => Effect.Effect<readonly PracticePlan[], DatabaseError>;
		readonly get: (id: string) => Effect.Effect<PracticePlan | undefined, DatabaseError>;
		readonly create: (input: { authorId: string; title: string; structure: PlanStructure }) => Effect.Effect<PracticePlan, DatabaseError>;
		readonly update: (id: string, input: { title?: string; structure?: PlanStructure }) => Effect.Effect<PracticePlan | undefined, DatabaseError>;
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
						.pipe(Effect.map((r) => (r ? toPlan(r) : undefined)))
			});
		})
	);
}
