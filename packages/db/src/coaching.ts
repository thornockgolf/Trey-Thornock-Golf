import { Context, Effect, Layer } from 'effect';
import { Db, type Queryer } from './db';
import type { DatabaseError } from './errors';

export interface PlayerSummary {
	readonly id: string;
	readonly displayName: string | null;
	readonly email: string | null;
	readonly assigned: boolean;
	readonly joinedAt: Date;
	readonly newVideos: number;
	readonly lastVideoAt: Date | null;
	readonly upcomingSessions: number;
	readonly completedSessions: number;
	readonly hasQuestionnaire: boolean;
	/** Messages from this player the coach has not read yet. */
	readonly unreadMessages: number;
}

interface PlayerRow {
	id: string;
	display_name: string | null;
	email: string | null;
	assigned: boolean | null;
	created_at: Date;
	new_videos: string;
	last_video_at: Date | null;
	upcoming: string;
	completed: string;
	has_questionnaire: boolean;
	unread_messages: string;
}

export interface CoachNote {
	readonly id: string;
	readonly body: string;
	readonly createdAt: Date;
}

export type AssignOutcome = 'Assigned' | 'NotAPlayer';
export type NoteWrite = { readonly _tag: 'Added'; readonly note: CoachNote } | { readonly _tag: 'NotPaired' };

/**
 * Make the coach-player relationship active and make sure the pair has a conversation. Safe to
 * repeat. Returns true when the relationship was not active before.
 */
export const startCoaching = (q: Queryer, coachId: string, playerId: string) =>
	Effect.gen(function* () {
		const was = yield* q.maybeOne<{ status: string }>(`select status from coach_assignments where coach_id = $1 and player_id = $2`, [coachId, playerId]);
		yield* q.query(
			`insert into coach_assignments (coach_id, player_id, status) values ($1, $2, 'active')
			 on conflict (coach_id, player_id) do update set status = 'active'`,
			[coachId, playerId]
		);
		yield* q.query(`insert into conversations (coach_id, player_id) values ($1, $2) on conflict (coach_id, player_id) do nothing`, [coachId, playerId]);
		return was?.status !== 'active';
	});

/** The coach new players are paired with: the longest-standing coach (there is one at launch). */
export const defaultCoachId = (q: Queryer) =>
	q.maybeOne<{ id: string }>(`select id from users where role = 'coach' order by created_at, id limit 1`).pipe(Effect.map((r) => r?.id));

export class Coaching extends Context.Service<
	Coaching,
	{
		/**
		 * Every player, with whether `coachId` has an active relationship with them and a few numbers for the dashboard.
		 * Assigned players first, then the most recent video, then the newest sign-up.
		 */
		readonly listPlayers: (coachId: string) => Effect.Effect<readonly PlayerSummary[], DatabaseError>;
		/** The coach a player is working with now (the earliest active relationship), if any. */
		readonly coachFor: (playerId: string) => Effect.Effect<string | undefined, DatabaseError>;
		/** Start (or resume) coaching a player. `NotAPlayer` when the id is not a player. Safe to repeat. */
		readonly assign: (coachId: string, playerId: string) => Effect.Effect<AssignOutcome, DatabaseError>;
		/** End the relationship (history stays). False when there was no active one. */
		readonly end: (coachId: string, playerId: string) => Effect.Effect<boolean, DatabaseError>;
		/** Private notes on an assigned player, newest first. Never shown to players. */
		readonly listNotes: (coachId: string, playerId: string) => Effect.Effect<readonly CoachNote[], DatabaseError>;
		/** Add a note; `NotPaired` unless the coach has an active relationship with the player. */
		readonly addNote: (coachId: string, playerId: string, body: string) => Effect.Effect<NoteWrite, DatabaseError>;
	}
>()('ttg/db/Coaching') {
	static readonly layer = Layer.effect(
		Coaching,
		Effect.gen(function* () {
			const db = yield* Db;
			const toNote = (r: { id: string; body: string; created_at: Date }): CoachNote => ({ id: r.id, body: r.body, createdAt: r.created_at });
			return Coaching.of({
				listPlayers: (coachId) =>
					db
						.query<PlayerRow>(
							`select u.id, u.display_name, u.email, u.created_at, (ca.status = 'active') as assigned,
							   (select count(*) from videos v where v.owner_id = u.id and v.kind = 'swing' and v.status = 'ready'
							      and v.created_at > now() - interval '7 days') as new_videos,
							   (select max(v.created_at) from videos v where v.owner_id = u.id and v.kind = 'swing' and v.status = 'ready') as last_video_at,
							   (select count(*) from plan_sessions s join plan_assignments a on a.id = s.assignment_id
							      where a.player_id = u.id and a.status = 'active' and s.completed_at is null and s.scheduled_on >= current_date) as upcoming,
							   (select count(*) from plan_sessions s join plan_assignments a on a.id = s.assignment_id
							      where a.player_id = u.id and a.status = 'active' and s.completed_at is not null) as completed,
							   exists (select 1 from questionnaire_responses q where q.user_id = u.id and q.completed_at is not null) as has_questionnaire,
							   (select count(*) from messages m join conversations c on c.id = m.conversation_id
							      where c.coach_id = $1 and c.player_id = u.id and m.sender_id = u.id
							        and m.created_at > coalesce(c.coach_last_read_at, '-infinity')) as unread_messages
							 from users u left join coach_assignments ca on ca.player_id = u.id and ca.coach_id = $1
							 where u.role = 'player' and u.deletion_requested_at is null
							 order by (ca.status = 'active') desc nulls last, last_video_at desc nulls last, u.created_at desc`,
							[coachId]
						)
						.pipe(
							Effect.map((rows) =>
								rows.map((r) => ({
									id: r.id,
									displayName: r.display_name,
									email: r.email,
									assigned: r.assigned === true,
									joinedAt: r.created_at,
									newVideos: Number(r.new_videos),
									lastVideoAt: r.last_video_at,
									upcomingSessions: Number(r.upcoming),
									completedSessions: Number(r.completed),
									hasQuestionnaire: r.has_questionnaire,
									unreadMessages: Number(r.unread_messages)
								}))
							)
						),
				coachFor: (playerId) =>
					db
						.maybeOne<{ coach_id: string }>(`select coach_id from coach_assignments where player_id = $1 and status = 'active' order by created_at limit 1`, [playerId])
						.pipe(Effect.map((r) => r?.coach_id)),
				assign: (coachId, playerId) =>
					Effect.gen(function* () {
						const player = yield* db.maybeOne(`select 1 as ok from users where id = $1 and role = 'player' and deletion_requested_at is null`, [playerId]);
						if (!player) return 'NotAPlayer' as const;
						yield* startCoaching(db, coachId, playerId);
						return 'Assigned' as const;
					}),
				end: (coachId, playerId) =>
					db
						.query(`update coach_assignments set status = 'ended' where coach_id = $1 and player_id = $2 and status = 'active' returning id`, [coachId, playerId])
						.pipe(Effect.map((rows) => rows.length > 0)),
				listNotes: (coachId, playerId) =>
					db
						.query<{ id: string; body: string; created_at: Date }>(
							`select n.id, n.body, n.created_at from coach_notes n join coach_assignments a on a.id = n.assignment_id
							 where a.coach_id = $1 and a.player_id = $2 order by n.created_at desc`,
							[coachId, playerId]
						)
						.pipe(Effect.map((rows) => rows.map(toNote))),
				addNote: (coachId, playerId, body) =>
					Effect.gen(function* () {
						const row = yield* db.maybeOne<{ id: string; body: string; created_at: Date }>(
							`insert into coach_notes (assignment_id, body)
							 select a.id, $3 from coach_assignments a where a.coach_id = $1 and a.player_id = $2 and a.status = 'active'
							 returning id, body, created_at`,
							[coachId, playerId, body]
						);
						return row ? ({ _tag: 'Added', note: toNote(row) } as const) : ({ _tag: 'NotPaired' } as const);
					})
			});
		})
	);
}
