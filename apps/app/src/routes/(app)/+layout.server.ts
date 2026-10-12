import { currentUser } from '#lib/server/auth';
import { runLoad } from '#lib/server/runtime';
import type { LayoutServerLoad } from './$types';

// Everything inside the app shell is signed-in (hooks already redirected anonymous users).
// Resolving the user here gives every page its role and database id.
export const load: LayoutServerLoad = async (event) => ({ user: await runLoad(event, currentUser) });
