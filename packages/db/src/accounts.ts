import { Context, Effect, Layer } from 'effect';
import { keys } from '@ttg/shared';
import { Db } from './db';
import type { DatabaseError } from './errors';

/** What the app needs to close a player's account outside the database. */
export interface DeletionTarget {
	readonly clerkUserId: string;
	readonly stripeCustomerId: string | undefined;
	/** The account was already erased (a repeat request): nothing is left to do. */
	readonly deleted: boolean;
}

/**
 * Account deletion, coach-triggered. The app calls `requestDeletion` (locks the account), cancels billing and
 * removes the sign-in, then queues `account.delete`; the worker calls `objectKeys` to delete the files and
 * `erase` to delete the rows. Payments, subscriptions and the Stripe customer link are kept for accounting:
 * the `users` row stays as a tombstone with its personal fields scrubbed.
 */
export class Accounts extends Context.Service<
	Accounts,
	{
		/** Lock the account and say what to close elsewhere. `undefined` when the id is not a player. Safe to repeat. */
		readonly requestDeletion: (userId: string) => Effect.Effect<DeletionTarget | undefined, DatabaseError>;
		/** Where a player's deletion stands. `undefined` when the id is not a player. */
		readonly status: (userId: string) => Effect.Effect<'NotRequested' | 'Pending' | 'Erased' | undefined, DatabaseError>;
		/** Every R2 key that belongs to the player: videos (source, processed, poster, sprite), coach recordings, photo. */
		readonly objectKeys: (userId: string) => Effect.Effect<readonly string[], DatabaseError>;
		/** Delete the player's rows and scrub the `users` row. One transaction; a no-op once done. */
		readonly erase: (userId: string) => Effect.Effect<'Erased' | 'AlreadyErased' | 'NotRequested', DatabaseError>;
	}
>()('ttg/db/Accounts') {
	static readonly layer = Layer.effect(
		Accounts,
		Effect.gen(function* () {
			const db = yield* Db;

			const requestDeletion = (userId: string) =>
				db
					.maybeOne<{ clerk_user_id: string; deleted_at: Date | null; stripe_customer_id: string | null }>(
						`update users u set deletion_requested_at = coalesce(u.deletion_requested_at, now())
						 where u.id = $1 and u.role = 'player'
						 returning u.clerk_user_id, u.deleted_at, (select stripe_customer_id from stripe_customers where user_id = u.id) as stripe_customer_id`,
						[userId]
					)
					.pipe(
						Effect.map((r) =>
							r ? { clerkUserId: r.clerk_user_id, stripeCustomerId: r.stripe_customer_id ?? undefined, deleted: r.deleted_at !== null } : undefined
						)
					);

			const status = (userId: string) =>
				db
					.maybeOne<{ requested: boolean; deleted: boolean }>(
						`select deletion_requested_at is not null as requested, deleted_at is not null as deleted from users where id = $1 and role = 'player'`,
						[userId]
					)
					.pipe(Effect.map((r) => (r ? (r.deleted ? ('Erased' as const) : r.requested ? ('Pending' as const) : ('NotRequested' as const)) : undefined)));

			const objectKeys = (userId: string) =>
				Effect.gen(function* () {
					const videos = yield* db.query<{ id: string; source_key: string | null; processed_key: string | null; thumbnail_key: string | null; sprite_key: string | null }>(
						`select id, source_key, processed_key, thumbnail_key, sprite_key from videos where owner_id = $1`,
						[userId]
					);
					const segments = yield* db.query<{ clip_key: string | null; source_key: string | null }>(
						`select s.clip_key, s.source_key from analysis_segments s
						 join analyses a on a.id = s.analysis_id join videos v on v.id = a.video_id where v.owner_id = $1`,
						[userId]
					);
					const exports = yield* db.query<{ output_key: string | null }>(
						`select e.output_key from analysis_exports e join analyses a on a.id = e.analysis_id join videos v on v.id = a.video_id where v.owner_id = $1`,
						[userId]
					);
					const photo = yield* db.query<{ photo_key: string | null }>(`select photo_key from player_profiles where user_id = $1`, [userId]);
					const all = [
						...videos.flatMap((v) => [v.source_key, v.processed_key, v.thumbnail_key, v.sprite_key, keys.spriteVtt(v.id)]),
						...segments.flatMap((s) => [s.clip_key, s.source_key]),
						...exports.map((e) => e.output_key),
						...photo.map((p) => p.photo_key)
					];
					return [...new Set(all.filter((k): k is string => !!k))];
				});

			const erase = (userId: string) =>
				db.transaction((tx) =>
					Effect.gen(function* () {
						const user = yield* tx.maybeOne<{ requested: boolean; deleted: boolean }>(
							`select deletion_requested_at is not null as requested, deleted_at is not null as deleted from users where id = $1 and role = 'player' for update`,
							[userId]
						);
						if (!user?.requested) return 'NotRequested' as const;
						if (user.deleted) return 'AlreadyErased' as const;

						const vids = `select id from videos where owner_id = $1`;
						const anls = `select id from analyses where video_id in (${vids})`;
						const convs = `select id from conversations where player_id = $1`;
						const run = (sql: string) => tx.query(sql, [userId]);

						// The player's own notifications, and the coach's that point at the player's data.
						yield* run(
							`delete from notifications where user_id = $1
							   or payload->>'conversationId' in (select id::text from (${convs}) c)
							   or payload->>'videoId' in (select id::text from (${vids}) v)
							   or payload->>'analysisId' in (select id::text from (${anls}) a)
							   or payload->>'senderId' = $1::text or payload->>'playerId' = $1::text`
						);
						yield* run(`delete from messages where conversation_id in (${convs}) or sender_id = $1 or video_id in (${vids})`);
						yield* run(`delete from conversations where player_id = $1`);
						yield* run(`delete from annotations where video_id in (${vids}) or analysis_id in (${anls}) or author_id = $1`);
						yield* run(`delete from analysis_exports where analysis_id in (${anls})`);
						yield* run(`delete from analysis_segments where analysis_id in (${anls})`);
						yield* run(`delete from analyses where video_id in (${vids})`);
						yield* run(`delete from videos where owner_id = $1`);
						yield* run(`delete from plan_sessions where assignment_id in (select id from plan_assignments where player_id = $1)`);
						yield* run(`delete from plan_assignments where player_id = $1`);
						yield* run(`delete from check_ins where player_id = $1`);
						yield* run(`delete from assessment_results where player_id = $1`);
						yield* run(`delete from questionnaire_responses where user_id = $1`);
						yield* run(`delete from push_subscriptions where user_id = $1`);
						yield* run(`delete from player_profiles where user_id = $1`);
						yield* run(`delete from coach_notes where assignment_id in (select id from coach_assignments where player_id = $1)`);
						yield* run(`delete from coach_assignments where player_id = $1`);
						// Tombstone: payments, subscriptions and stripe_customers still point here.
						yield* run(`update users set clerk_user_id = 'deleted:' || id::text, display_name = null, email = null, deleted_at = now() where id = $1`);
						return 'Erased' as const;
					})
				);

			return Accounts.of({ requestDeletion, status, objectKeys, erase });
		})
	);
}
