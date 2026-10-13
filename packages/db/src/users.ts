import { Context, Effect, Layer } from 'effect';
import type { Role } from '@ttg/shared';
import { Db } from './db';
import type { DatabaseError } from './errors';

export interface User {
	readonly id: string;
	readonly clerkUserId: string;
	readonly role: Role;
	readonly displayName: string | null;
	readonly email: string | null;
	/** Account deletion has been requested: the user can no longer use the app. */
	readonly locked: boolean;
	/** Name and email were never synced from Clerk, or not for a day: the app server refreshes them. Absent in test stand-ins. */
	readonly profileStale?: boolean;
}

/** Re-read name and email from Clerk when the last sync is older than this. */
export const PROFILE_SYNC_INTERVAL = '1 day';

interface UserRow {
	id: string;
	clerk_user_id: string;
	role: Role;
	display_name: string | null;
	email: string | null;
	locked: boolean;
	stale: boolean;
}

const toUser = (r: UserRow): User => ({
	id: r.id,
	clerkUserId: r.clerk_user_id,
	role: r.role,
	displayName: r.display_name,
	email: r.email,
	locked: r.locked,
	profileStale: r.stale
});

const COLUMNS = `id, clerk_user_id, role, display_name, email, (deletion_requested_at is not null) as locked, (deleted_at is null and (profile_synced_at is null or profile_synced_at < now() - interval '${PROFILE_SYNC_INTERVAL}')) as stale`;

export class Users extends Context.Service<
	Users,
	{
		/**
		 * The users row for a Clerk user, created on first sight. `role` is decided by the app server
		 * (coach allowlist) and is written here so it can be joined on; an existing row is updated
		 * when the role changes. Never takes a role from the client.
		 */
		readonly ensure: (input: { clerkUserId: string; role: Role }) => Effect.Effect<User, DatabaseError>;
		readonly findByClerkId: (clerkUserId: string) => Effect.Effect<User | undefined, DatabaseError>;
		readonly findById: (id: string) => Effect.Effect<User | undefined, DatabaseError>;
		/**
		 * Store the name and email Clerk reports. A null value never clears what is stored, and a name the player chose
		 * themselves (`setDisplayName`) is kept. Marks the row as synced, so the app asks Clerk again only after a day.
		 */
		readonly syncProfile: (id: string, input: { displayName: string | null; email: string | null }) => Effect.Effect<User | undefined, DatabaseError>;
		/** The name shown to the coach and in the app; null or empty clears it. A name set here is not overwritten by the Clerk sync. */
		readonly setDisplayName: (id: string, name: string | null) => Effect.Effect<User | undefined, DatabaseError>;
	}
>()('ttg/db/Users') {
	static readonly layer = Layer.effect(
		Users,
		Effect.gen(function* () {
			const db = yield* Db;
			const findByClerkId = (clerkUserId: string) =>
				db
					.maybeOne<UserRow>(`select ${COLUMNS} from users where clerk_user_id = $1`, [clerkUserId])
					.pipe(Effect.map((r) => (r ? toUser(r) : undefined)));
			const ensure = Effect.fn('Users.ensure')(function* (input: { clerkUserId: string; role: Role }) {
				const existing = yield* findByClerkId(input.clerkUserId);
				if (existing && existing.role === input.role) return existing;
				// Insert, or on a race / role change update the role. One statement, safe to retry.
				const row = yield* db.maybeOne<UserRow>(
					`insert into users (clerk_user_id, role) values ($1, $2)
					 on conflict (clerk_user_id) do update set role = excluded.role
					 returning ${COLUMNS}`,
					[input.clerkUserId, input.role]
				);
				return toUser(row!);
			});
			const findById = (id: string) => db.maybeOne<UserRow>(`select ${COLUMNS} from users where id = $1`, [id]).pipe(Effect.map((r) => (r ? toUser(r) : undefined)));
			const setDisplayName = (id: string, name: string | null) =>
				db
					.maybeOne<UserRow>(`update users set display_name = $2::text, display_name_locked = ($2::text is not null) where id = $1 returning ${COLUMNS}`, [id, name])
					.pipe(Effect.map((r) => (r ? toUser(r) : undefined)));
			const syncProfile = (id: string, input: { displayName: string | null; email: string | null }) =>
				db
					.maybeOne<UserRow>(
						`update users set
						   display_name = case when display_name_locked then display_name else coalesce($2::text, display_name) end,
						   email = coalesce($3::text, email),
						   profile_synced_at = now()
						 where id = $1 and deleted_at is null and deletion_requested_at is null
						 returning ${COLUMNS}`,
						[id, input.displayName, input.email]
					)
					.pipe(Effect.map((r) => (r ? toUser(r) : undefined)));
			return Users.of({ ensure, findByClerkId, findById, syncProfile, setDisplayName });
		})
	);
}
