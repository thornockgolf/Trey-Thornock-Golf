import { getProfile } from '#lib/server/profile';
import { runLoad } from '#lib/server/runtime';
import type { PageServerLoad } from './$types';

/** The signed-in player's own profile. */
export const load: PageServerLoad = (event) => runLoad(event, getProfile);
