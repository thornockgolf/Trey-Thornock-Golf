import { Users } from '@ttg/db';
import { Context, Effect, Layer } from 'effect';
import type { CurrentUserData, Role } from '@ttg/shared';
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
	const user = yield* users.ensure({ clerkUserId, role: ids.has(clerkUserId) ? 'coach' : 'player' });
	return { id: user.id, clerkUserId, role: user.role } satisfies CurrentUserData;
});

/** Fail with Forbidden (and leak nothing) unless the user has one of the given roles. */
export const requireRole = (...roles: readonly Role[]) =>
	Effect.gen(function* () {
		const user = yield* currentUser;
		if (!roles.includes(user.role)) return yield* new Forbidden({ message: 'Not allowed' });
		return user;
	});
