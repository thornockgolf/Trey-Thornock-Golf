import { shellBilling } from '#lib/server/billing';
import { currentUser } from '#lib/server/auth';
import { feedbackEnabled } from '#lib/server/feedback-flag';
import { runLoad } from '#lib/server/runtime';
import { Effect } from 'effect';
import type { LayoutServerLoad } from './$types';

// Everything inside the app shell is signed-in (hooks already redirected anonymous users).
// Resolving the user here gives every page its role and database id; a player's payment state drives the banner.
export const load: LayoutServerLoad = async (event) =>
	runLoad(
		event,
		Effect.gen(function* () {
			const user = yield* currentUser;
			return { user, billing: yield* shellBilling(user), feedbackEnabled };
		})
	);
