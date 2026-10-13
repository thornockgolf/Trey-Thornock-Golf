import { Context, Effect, Layer } from 'effect';
import { UpstreamError } from './errors';

/** The one Clerk Backend call the app makes: removing a sign-in. */
export interface ClerkUsersClient {
	readonly users: { readonly deleteUser: (userId: string) => Promise<unknown> };
}

/**
 * Clerk from the app server, for account deletion. Deleting a user also ends their sessions. A user that is
 * already gone (404) counts as deleted, so a retried request does not fail.
 */
export class ClerkAdmin extends Context.Service<
	ClerkAdmin,
	{ readonly deleteUser: (clerkUserId: string) => Effect.Effect<void, UpstreamError> }
>()('ttg/app/ClerkAdmin') {
	/** Live: pass svelte-clerk's `clerkClient` (see runtime.ts). Kept out of this file so tests need no SvelteKit. */
	static layerFromClient = (client: ClerkUsersClient) =>
		Layer.succeed(
			ClerkAdmin,
			ClerkAdmin.of({
				deleteUser: (clerkUserId) =>
					Effect.tryPromise({ try: () => client.users.deleteUser(clerkUserId), catch: (cause) => cause }).pipe(
						Effect.asVoid,
						Effect.catch((cause) =>
							(cause as { status?: number }).status === 404
								? Effect.void
								: Effect.fail(new UpstreamError({ message: 'Could not remove the player\'s sign-in from Clerk. Nothing was deleted; try again.', cause }))
						)
					)
			})
		);
}
