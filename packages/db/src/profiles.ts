import type { ProfileSummary } from '@ttg/shared';
import { Context, Effect, Layer } from 'effect';
import { Db } from './db';
import type { DatabaseError } from './errors';

export interface Profile {
	readonly userId: string;
	readonly handicap: number | null;
	readonly goals: string | null;
	readonly homeCourse: string | null;
	readonly hand: 'left' | 'right' | null;
	readonly equipment: string | null;
	readonly limitations: string | null;
	readonly photoKey: string | null;
}

/** Fields to change: a value sets it, `null` clears it, `undefined` (absent) keeps it. */
export interface ProfilePatch {
	readonly handicap?: number | null;
	readonly goals?: string | null;
	readonly homeCourse?: string | null;
	readonly hand?: 'left' | 'right' | null;
	readonly equipment?: string | null;
	readonly limitations?: string | null;
}

interface ProfileRow {
	user_id: string;
	handicap: string | null; // numeric
	goals: string | null;
	home_course: string | null;
	hand: 'left' | 'right' | null;
	equipment: string | null;
	limitations: string | null;
	photo_key: string | null;
}

const COLUMNS = 'user_id, handicap, goals, home_course, hand, equipment, limitations, photo_key';

const toProfile = (r: ProfileRow): Profile => ({
	userId: r.user_id,
	handicap: r.handicap === null ? null : Number(r.handicap),
	goals: r.goals,
	homeCourse: r.home_course,
	hand: r.hand,
	equipment: r.equipment,
	limitations: r.limitations,
	photoKey: r.photo_key
});

const empty = (userId: string): Profile => ({ userId, handicap: null, goals: null, homeCourse: null, hand: null, equipment: null, limitations: null, photoKey: null });

const COLUMN_OF: Record<keyof ProfilePatch, string> = {
	handicap: 'handicap',
	goals: 'goals',
	homeCourse: 'home_course',
	hand: 'hand',
	equipment: 'equipment',
	limitations: 'limitations'
};

export class Profiles extends Context.Service<
	Profiles,
	{
		/** The profile, or an empty one when the player has not filled anything in. */
		readonly get: (userId: string) => Effect.Effect<Profile, DatabaseError>;
		/** Create the row if needed and apply the patch. Returns the profile as it is now. */
		readonly update: (userId: string, patch: ProfilePatch) => Effect.Effect<Profile, DatabaseError>;
		readonly setPhotoKey: (userId: string, key: string) => Effect.Effect<Profile, DatabaseError>;
		/** Numbers for the profile summary: ready swings, the active plan's progress, the latest subscription's status. */
		readonly summary: (userId: string) => Effect.Effect<ProfileSummary, DatabaseError>;
	}
>()('ttg/db/Profiles') {
	static readonly layer = Layer.effect(
		Profiles,
		Effect.gen(function* () {
			const db = yield* Db;
			const get = (userId: string) =>
				db.maybeOne<ProfileRow>(`select ${COLUMNS} from player_profiles where user_id = $1`, [userId]).pipe(Effect.map((r) => (r ? toProfile(r) : empty(userId))));
			return Profiles.of({
				get,
				update: (userId, patch) =>
					db.transaction((tx) =>
						Effect.gen(function* () {
							yield* tx.query(`insert into player_profiles (user_id) values ($1) on conflict (user_id) do nothing`, [userId]);
							const keys = (Object.keys(COLUMN_OF) as (keyof ProfilePatch)[]).filter((k) => patch[k] !== undefined);
							if (keys.length > 0) {
								const sets = keys.map((k, i) => `${COLUMN_OF[k]} = $${i + 2}`).join(', ');
								yield* tx.query(`update player_profiles set ${sets} where user_id = $1`, [userId, ...keys.map((k) => patch[k] ?? null)]);
							}
							const row = yield* tx.maybeOne<ProfileRow>(`select ${COLUMNS} from player_profiles where user_id = $1`, [userId]);
							return toProfile(row!);
						})
					),
				setPhotoKey: (userId, key) =>
					db.transaction((tx) =>
						Effect.gen(function* () {
							yield* tx.query(`insert into player_profiles (user_id, photo_key) values ($1, $2) on conflict (user_id) do update set photo_key = excluded.photo_key`, [userId, key]);
							return toProfile((yield* tx.maybeOne<ProfileRow>(`select ${COLUMNS} from player_profiles where user_id = $1`, [userId]))!);
						})
					),
				summary: (userId) =>
					Effect.gen(function* () {
						const videos = yield* db.maybeOne<{ n: string }>(`select count(*) as n from videos where owner_id = $1 and kind = 'swing' and status = 'ready'`, [userId]);
						const plan = yield* db.maybeOne<{ title: string; sessions: string; done: string }>(
							`select p.title, count(s.id) as sessions, count(s.completed_at) as done
							 from plan_assignments a join practice_plans p on p.id = a.plan_id left join plan_sessions s on s.assignment_id = a.id
							 where a.player_id = $1 and a.status = 'active' group by a.id, p.title order by a.created_at desc limit 1`,
							[userId]
						);
						const sub = yield* db.maybeOne<{ status: string }>(`select status from subscriptions where user_id = $1 order by created_at desc limit 1`, [userId]);
						return {
							videos: Number(videos?.n ?? 0),
							plan: plan ? { title: plan.title, sessions: Number(plan.sessions), sessionsDone: Number(plan.done) } : null,
							subscriptionStatus: sub?.status ?? null
						} satisfies ProfileSummary;
					})
			});
		})
	);
}
