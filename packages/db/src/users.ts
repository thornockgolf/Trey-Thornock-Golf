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
}

interface UserRow {
	id: string;
	clerk_user_id: string;
	role: Role;
	display_name: string | null;
	email: string | null;
	locked: boolean;
}

const toUser = (r: UserRow): User => ({
	id: r.id,
	clerkUserId: r.clerk_user_id,
	role: r.role,
	displayName: r.display_name,
	email: r.email,
	locked: r.locked
});

const COLUMNS = 'id, clerk_user_id, role, display_name, email, (deletion_requested_at is not null) as locked';

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
		/** The name shown to the coach and in the app; null or empty clears it. */
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
				db.maybeOne<UserRow>(`update users set display_name = $2 where id = $1 returning ${COLUMNS}`, [id, name]).pipe(Effect.map((r) => (r ? toUser(r) : undefined)));
			return Users.of({ ensure, findByClerkId, findById, setDisplayName });
		})
	);
}
