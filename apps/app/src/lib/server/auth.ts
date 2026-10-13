import { Users, type User } from '@ttg/db';
import { Cause, Context, Effect, Layer } from 'effect';
import type { CurrentUserData, Role } from '@ttg/shared';
import { ClerkAdmin } from './clerk-admin';
import { Forbidden, NotAuthenticated } from './errors';
import { RequestContext } from './request-context';

/** Clerk user IDs that are coaches (COACH_CLERK_USER_IDS). Everyone else is a player. */
export class CoachAllowlist extends Context.Service<CoachAllowlist, { readonly ids: ReadonlySet<string> }>()(
	'ttg/app/CoachAllowlist'
) {
	/** Build the layer from a comma-separated list; empty or missing means no coaches. */
	static layerFromCsv = (csv: string | undefined) =>
		Layer.succeed(
			CoachAllowlist,
			CoachAllowlist.of({
				ids: new Set(
					(csv ?? '')
						.split(',')
						.map((s) => s.trim())
						.filter(Boolean)
				)
			})
		);
}

/** Wait this long for Clerk before serving the request without a fresh name. */
const CLERK_SYNC_TIMEOUT = '2 seconds';
/** After a failed sync, leave Clerk alone for this long (per process), so an outage does not slow every request. */
const CLERK_RETRY_AFTER_MS = 60_000;
const lastAttempt = new Map<string, number>();

/**
 * Copy the person's name and email from Clerk into their row (first sign-in, then about daily). Best effort: a Clerk
 * or database failure is logged and the request goes on with what is stored. The values come from Clerk's server
 * API for the signed-in user, never from the client. A no-op when `ClerkAdmin` is not provided (tests).
 */
export const syncClerkProfile = (user: User) =>
	Effect.gen(function* () {
		if (!user.profileStale) return user;
		const clerk = yield* Effect.serviceOption(ClerkAdmin);
		if (clerk._tag === 'None') return user;
		const now = Date.now();
		if (now - (lastAttempt.get(user.clerkUserId) ?? 0) < CLERK_RETRY_AFTER_MS) return user;
		const profile = yield* clerk.value.getProfile(user.clerkUserId).pipe(Effect.timeout(CLERK_SYNC_TIMEOUT));
		const synced = yield* (yield* Users).syncProfile(user.id, { displayName: profile.name, email: profile.email });
		return synced ?? user;
	}).pipe(
		Effect.catchCause((cause) =>
			Effect.sync(() => {
				lastAttempt.set(user.clerkUserId, Date.now());
				console.error('Clerk profile sync failed:', Cause.pretty(cause));
				return user;
			})
		)
	);

/**
 * Resolve the signed-in user for this request: Clerk session first, then role. Authorization
 * lives here in the app server, never in Postgres (spec "Cross-cutting Conventions").
 */
export const currentUser = Effect.gen(function* () {
	const { event } = yield* RequestContext;
	const clerkUserId = event.locals.auth().userId;
	if (!clerkUserId) return yield* new NotAuthenticated({ message: 'Sign in required' });
	const { ids } = yield* CoachAllowlist;
	const users = yield* Users;
	// First sight creates the row as a player; a coach allowlist change updates the role.
	const user = yield* users.ensure({ clerkUserId, role: ids.has(clerkUserId) ? 'coach' : 'player' }).pipe(Effect.flatMap(syncClerkProfile));
	// Deletion was requested: the account is closed even if the sign-in was not removed yet.
	if (user.locked) return yield* new Forbidden({ message: 'This account has been closed' });
	return { id: user.id, clerkUserId, role: user.role } satisfies CurrentUserData;
});

/** Fail with Forbidden (and leak nothing) unless the user has one of the given roles. */
export const requireRole = (...roles: readonly Role[]) =>
	Effect.gen(function* () {
		const user = yield* currentUser;
		if (!roles.includes(user.role)) return yield* new Forbidden({ message: 'Not allowed' });
		return user;
	});
