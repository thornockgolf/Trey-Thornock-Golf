import { Context, Effect, Layer } from 'effect';
import { Db } from './db';
import type { DatabaseError } from './errors';

/** What a player has starred. Ids only; the page joins them to the sessions it already loaded. */
export interface PlayerFavorites {
	readonly sessionIds: readonly string[];
	readonly drillIds: readonly string[];
}

export type FavoriteKind = 'session' | 'drill';

export class Favorites extends Context.Service<
	Favorites,
	{
		readonly list: (userId: string) => Effect.Effect<PlayerFavorites, DatabaseError>;
		/**
		 * Star a session or drill. Idempotent. The target must belong to the player: a session of one of their active
		 * assignments, or a drill that appears in one of their sessions. Anything else is `Missing`.
		 */
		readonly add: (input: { userId: string; kind: FavoriteKind; targetId: string }) => Effect.Effect<'Saved' | 'Missing', DatabaseError>;
		/** Unstar. Idempotent, and only ever touches the player's own rows. */
		readonly remove: (input: { userId: string; kind: FavoriteKind; targetId: string }) => Effect.Effect<void, DatabaseError>;
	}
>()('ttg/db/Favorites') {
	static readonly layer = Layer.effect(
		Favorites,
		Effect.gen(function* () {
			const db = yield* Db;
			return Favorites.of({
				list: (userId) =>
					db.query<{ kind: FavoriteKind; session_id: string | null; drill_id: string | null }>(`select kind, session_id, drill_id from favorites where user_id = $1 order by created_at`, [userId]).pipe(
						Effect.map((rows) => ({
							sessionIds: rows.flatMap((r) => (r.kind === 'session' && r.session_id ? [r.session_id] : [])),
							drillIds: rows.flatMap((r) => (r.kind === 'drill' && r.drill_id ? [r.drill_id] : []))
						}))
					),
				add: ({ userId, kind, targetId }) =>
					Effect.gen(function* () {
						if (kind === 'session') {
							const row = yield* db.maybeOne<{ id: string }>(
								`insert into favorites (user_id, kind, session_id)
								 select $1, 'session', s.id from plan_sessions s join plan_assignments a on a.id = s.assignment_id
								 where s.id = $2 and a.player_id = $1 and a.status = 'active'
								 on conflict (user_id, session_id) where session_id is not null do update set updated_at = now()
								 returning id`,
								[userId, targetId]
							);
							return row ? 'Saved' : 'Missing';
						}
						const row = yield* db.maybeOne<{ id: string }>(
							`insert into favorites (user_id, kind, drill_id)
							 select $1, 'drill', d.id from drills d
							 where d.id = $2 and exists (
							   select 1 from plan_sessions s join plan_assignments a on a.id = s.assignment_id
							   where a.player_id = $1 and a.status = 'active' and s.items @> jsonb_build_array(jsonb_build_object('drillId', d.id::text)))
							 on conflict (user_id, drill_id) where drill_id is not null do update set updated_at = now()
							 returning id`,
							[userId, targetId]
						);
						return row ? 'Saved' : 'Missing';
					}),
				remove: ({ userId, kind, targetId }) =>
					db.query(kind === 'session' ? `delete from favorites where user_id = $1 and session_id = $2` : `delete from favorites where user_id = $1 and drill_id = $2`, [userId, targetId]).pipe(Effect.asVoid)
			});
		})
	);
}
