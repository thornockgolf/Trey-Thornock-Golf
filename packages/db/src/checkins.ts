import type { CheckInAnswers } from '@ttg/shared';
import { Context, Effect, Layer } from 'effect';
import { Db } from './db';
import type { DatabaseError } from './errors';

export interface CheckIn {
	readonly id: string;
	readonly playerId: string;
	/** `YYYY-MM-DD`. */
	readonly scheduledOn: string;
	readonly answers: CheckInAnswers | null;
	readonly submittedAt: Date | null;
}

interface CheckInRow {
	id: string;
	player_id: string;
	scheduled_on: string;
	answers: CheckInAnswers | Record<string, never>;
	submitted_at: Date | null;
}

const COLUMNS = 'id, player_id, scheduled_on::text as scheduled_on, answers, submitted_at';

const toCheckIn = (r: CheckInRow): CheckIn => ({
	id: r.id,
	playerId: r.player_id,
	scheduledOn: r.scheduled_on,
	answers: r.submitted_at ? (r.answers as CheckInAnswers) : null,
	submittedAt: r.submitted_at
});

export type ScheduleCheckInResult = { readonly _tag: 'Scheduled'; readonly checkIns: readonly CheckIn[] } | { readonly _tag: 'NotPaired' };
export type SubmitResult =
	| { readonly _tag: 'Submitted'; readonly checkIn: CheckIn }
	| { readonly _tag: 'Missing' }
	| { readonly _tag: 'AlreadySubmitted' };

export class CheckIns extends Context.Service<
	CheckIns,
	{
		/**
		 * Schedule check-ins for a player, one per date, in one transaction, and tell the player (`check_in_scheduled`).
		 * `NotPaired` unless the coach has an active relationship with the player.
		 */
		readonly schedule: (input: { coachId: string; playerId: string; dates: readonly string[] }) => Effect.Effect<ScheduleCheckInResult, DatabaseError>;
		/** A player's check-ins by date, oldest first. */
		readonly listForPlayer: (playerId: string) => Effect.Effect<readonly CheckIn[], DatabaseError>;
		readonly get: (id: string) => Effect.Effect<CheckIn | undefined, DatabaseError>;
		/**
		 * The player submits their own scheduled check-in, once. Every coach with an active relationship with the player
		 * gets a `check_in_submitted` notification. Someone else's check-in is `Missing`.
		 */
		readonly submit: (input: { playerId: string; id: string; answers: CheckInAnswers }) => Effect.Effect<SubmitResult, DatabaseError>;
	}
>()('ttg/db/CheckIns') {
	static readonly layer = Layer.effect(
		CheckIns,
		Effect.gen(function* () {
			const db = yield* Db;
			return CheckIns.of({
				schedule: (i) =>
					db.transaction((tx) =>
						Effect.gen(function* () {
							const paired = yield* tx.maybeOne(`select 1 as ok from coach_assignments where coach_id = $1 and player_id = $2 and status = 'active'`, [i.coachId, i.playerId]);
							if (!paired) return { _tag: 'NotPaired' } as const;
							const rows: CheckIn[] = [];
							for (const date of i.dates) {
								const row = yield* tx.maybeOne<CheckInRow>(`insert into check_ins (player_id, scheduled_on) values ($1, $2::date) returning ${COLUMNS}`, [i.playerId, date]);
								rows.push(toCheckIn(row!));
							}
							yield* tx.query(`insert into notifications (user_id, type, payload) values ($1, 'check_in_scheduled', $2::jsonb)`, [
								i.playerId,
								JSON.stringify({ dates: i.dates, checkInIds: rows.map((r) => r.id) })
							]);
							return { _tag: 'Scheduled', checkIns: rows } as const;
						})
					),
				listForPlayer: (playerId) =>
					db.query<CheckInRow>(`select ${COLUMNS} from check_ins where player_id = $1 order by scheduled_on, created_at`, [playerId]).pipe(Effect.map((rows) => rows.map(toCheckIn))),
				get: (id) => db.maybeOne<CheckInRow>(`select ${COLUMNS} from check_ins where id = $1`, [id]).pipe(Effect.map((r) => (r ? toCheckIn(r) : undefined))),
				submit: (i) =>
					db.transaction((tx) =>
						Effect.gen(function* () {
							const row = yield* tx.maybeOne<CheckInRow>(`select ${COLUMNS} from check_ins where id = $1 and player_id = $2 for update`, [i.id, i.playerId]);
							if (!row) return { _tag: 'Missing' } as const;
							if (row.submitted_at) return { _tag: 'AlreadySubmitted' } as const;
							const updated = (yield* tx.maybeOne<CheckInRow>(
								`update check_ins set answers = $2::jsonb, submitted_at = now() where id = $1 returning ${COLUMNS}`,
								[i.id, JSON.stringify(i.answers)]
							))!;
							yield* tx.query(
								`insert into notifications (user_id, type, payload)
								 select a.coach_id, 'check_in_submitted', jsonb_build_object('playerId', $1::text, 'checkInId', $2::text)
								 from coach_assignments a where a.player_id = $1::uuid and a.status = 'active'`,
								[i.playerId, i.id]
							);
							return { _tag: 'Submitted', checkIn: toCheckIn(updated) } as const;
						})
					)
			});
		})
	);
}
