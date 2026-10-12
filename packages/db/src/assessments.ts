import { trendOf, type Trend } from '@ttg/shared';
import { Context, Effect, Layer } from 'effect';
import { Db } from './db';
import type { DatabaseError } from './errors';

export interface Assessment {
	readonly id: string;
	readonly name: string;
	readonly description: string | null;
	readonly unit: string | null;
}

export interface AssessmentResult {
	readonly id: string;
	readonly assessmentId: string;
	readonly name: string;
	readonly unit: string | null;
	/** The scheduled day, or the day it was recorded for an ad-hoc result. */
	readonly date: string;
	readonly value: number | null;
	readonly recordedAt: Date | null;
	readonly previousValue: number | null;
	readonly change: number | null;
	readonly trend: Trend | null;
}

interface ResultRow {
	id: string;
	assessment_id: string;
	name: string;
	unit: string | null;
	value: string | null; // numeric
	recorded_at: Date;
	scheduled_on: string | null;
	day: string;
}

const RESULT_SELECT = `r.id, r.assessment_id, a.name, a.unit, r.value, r.recorded_at, r.scheduled_on::text as scheduled_on,
	coalesce(r.scheduled_on, r.recorded_at::date)::text as day
	from assessment_results r join assessments a on a.id = r.assessment_id`;

/** Attach "previous value" and trend to each result: the same test's earlier recorded value, in time order. */
const withTrends = (rows: readonly ResultRow[]): AssessmentResult[] => {
	const last = new Map<string, number>();
	const ordered = [...rows].sort((a, b) => (a.day === b.day ? a.recorded_at.getTime() - b.recorded_at.getTime() : a.day < b.day ? -1 : 1));
	const out = new Map<string, AssessmentResult>();
	for (const r of ordered) {
		const value = r.value === null ? null : Number(r.value);
		const previous = last.get(r.assessment_id) ?? null;
		const { change, trend } = trendOf(value, previous);
		out.set(r.id, {
			id: r.id,
			assessmentId: r.assessment_id,
			name: r.name,
			unit: r.unit,
			date: r.day,
			value,
			recordedAt: value === null ? null : r.recorded_at,
			previousValue: value === null ? null : previous,
			change,
			trend
		});
		if (value !== null) last.set(r.assessment_id, value);
	}
	return rows.map((r) => out.get(r.id)!);
};

export type DefineResult = { readonly _tag: 'Defined'; readonly assessment: Assessment } | { readonly _tag: 'NameTaken' };
export type ScheduleAssessmentResult = { readonly _tag: 'Scheduled'; readonly result: AssessmentResult } | { readonly _tag: 'NotPaired' } | { readonly _tag: 'Missing' };
export type RecordAssessmentResult = { readonly _tag: 'Recorded'; readonly result: AssessmentResult } | { readonly _tag: 'NotPaired' } | { readonly _tag: 'Missing' };

export class Assessments extends Context.Service<
	Assessments,
	{
		readonly list: () => Effect.Effect<readonly Assessment[], DatabaseError>;
		readonly define: (input: { name: string; description?: string | null; unit?: string | null }) => Effect.Effect<DefineResult, DatabaseError>;
		/** Put a test on a player's calendar. `NotPaired` without an active coaching relationship, `Missing` for an unknown test. */
		readonly schedule: (input: { coachId: string; playerId: string; assessmentId: string; scheduledOn: string }) => Effect.Effect<ScheduleAssessmentResult, DatabaseError>;
		/**
		 * Record a value: for a scheduled test (`resultId`, which must be that player's, that test, and still empty) or ad
		 * hoc. The player is notified (`assessment_result`). `Missing` for an unknown or already-recorded one.
		 */
		readonly record: (input: { coachId: string; playerId: string; assessmentId: string; value: number; resultId?: string }) => Effect.Effect<RecordAssessmentResult, DatabaseError>;
		/** A player's results and scheduled tests by date, each with its trend against the previous recorded result. */
		readonly resultsForPlayer: (playerId: string, assessmentId?: string) => Effect.Effect<readonly AssessmentResult[], DatabaseError>;
		/** Tests the player has a result or a schedule for (what a player may read about). */
		readonly listForPlayer: (playerId: string) => Effect.Effect<readonly Assessment[], DatabaseError>;
	}
>()('ttg/db/Assessments') {
	static readonly layer = Layer.effect(
		Assessments,
		Effect.gen(function* () {
			const db = yield* Db;
			const toAssessment = (r: { id: string; name: string; description: string | null; unit: string | null }): Assessment => ({
				id: r.id,
				name: r.name,
				description: r.description,
				unit: r.unit
			});
			const resultsFor = (playerId: string) =>
				db
					.query<ResultRow>(`select ${RESULT_SELECT} where r.player_id = $1 order by day, r.recorded_at`, [playerId])
					.pipe(Effect.map((rows) => withTrends(rows)));
			const paired = (coachId: string, playerId: string) =>
				db
					.maybeOne(`select 1 as ok from coach_assignments where coach_id = $1 and player_id = $2 and status = 'active'`, [coachId, playerId])
					.pipe(Effect.map((r) => r !== undefined));
			return Assessments.of({
				list: () => db.query<Assessment>(`select id, name, description, unit from assessments order by name`).pipe(Effect.map((rows) => rows.map(toAssessment))),
				define: (i) =>
					Effect.gen(function* () {
						const row = yield* db.maybeOne<Assessment>(
							`insert into assessments (name, description, unit) values ($1, $2, $3)
							 on conflict (name) do nothing returning id, name, description, unit`,
							[i.name, i.description ?? null, i.unit ?? null]
						);
						return row ? ({ _tag: 'Defined', assessment: toAssessment(row) } as const) : ({ _tag: 'NameTaken' } as const);
					}),
				schedule: (i) =>
					Effect.gen(function* () {
						if (!(yield* paired(i.coachId, i.playerId))) return { _tag: 'NotPaired' } as const;
						const test = yield* db.maybeOne(`select 1 as ok from assessments where id = $1`, [i.assessmentId]);
						if (!test) return { _tag: 'Missing' } as const;
						const row = yield* db.maybeOne<{ id: string }>(
							`insert into assessment_results (assessment_id, player_id, scheduled_on) values ($1, $2, $3::date) returning id`,
							[i.assessmentId, i.playerId, i.scheduledOn]
						);
						const result = (yield* resultsFor(i.playerId)).find((r) => r.id === row!.id)!;
						return { _tag: 'Scheduled', result } as const;
					}),
				record: (i) =>
					db.transaction((tx) =>
						Effect.gen(function* () {
							const ok = yield* tx.maybeOne(`select 1 as ok from coach_assignments where coach_id = $1 and player_id = $2 and status = 'active'`, [i.coachId, i.playerId]);
							if (!ok) return { _tag: 'NotPaired' } as const;
							let id: string | undefined;
							if (i.resultId) {
								const row = yield* tx.maybeOne<{ id: string }>(
									`update assessment_results set value = $4, recorded_at = now()
									 where id = $1 and player_id = $2 and assessment_id = $3 and value is null returning id`,
									[i.resultId, i.playerId, i.assessmentId, i.value]
								);
								id = row?.id;
							} else {
								const test = yield* tx.maybeOne(`select 1 as ok from assessments where id = $1`, [i.assessmentId]);
								if (test) {
									id = (yield* tx.maybeOne<{ id: string }>(`insert into assessment_results (assessment_id, player_id, value) values ($1, $2, $3) returning id`, [i.assessmentId, i.playerId, i.value]))!.id;
								}
							}
							if (!id) return { _tag: 'Missing' } as const;
							yield* tx.query(`insert into notifications (user_id, type, payload) values ($1, 'assessment_result', $2::jsonb)`, [
								i.playerId,
								JSON.stringify({ assessmentId: i.assessmentId, resultId: id })
							]);
							const rows = yield* tx.query<ResultRow>(`select ${RESULT_SELECT} where r.player_id = $1 order by day, r.recorded_at`, [i.playerId]);
							return { _tag: 'Recorded', result: withTrends(rows).find((r) => r.id === id)! } as const;
						})
					),
				resultsForPlayer: (playerId, assessmentId) =>
					resultsFor(playerId).pipe(Effect.map((rows) => (assessmentId ? rows.filter((r) => r.assessmentId === assessmentId) : rows))),
				listForPlayer: (playerId) =>
					db
						.query<Assessment>(
							`select a.id, a.name, a.description, a.unit from assessments a
							 where exists (select 1 from assessment_results r where r.assessment_id = a.id and r.player_id = $1) order by a.name`,
							[playerId]
						)
						.pipe(Effect.map((rows) => rows.map(toAssessment)))
			});
		})
	);
}
