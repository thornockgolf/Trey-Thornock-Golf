import { coachPlansData } from '#lib/server/plans';
import { runLoad } from '#lib/server/runtime';
import type { PageServerLoad } from './$types';

/** Under `/coach`, so `coachGuard` limits it to coaches. Plans, the drill library and the players the coach works with. */
export const load: PageServerLoad = (event) => runLoad(event, coachPlansData);
