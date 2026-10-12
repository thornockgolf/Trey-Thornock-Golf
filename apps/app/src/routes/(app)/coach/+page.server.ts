import { dashboardData } from '#lib/server/players';
import { runLoad } from '#lib/server/runtime';
import type { PageServerLoad } from './$types';

/** Under `/coach`, so `coachGuard` limits it to coaches. Every player, split by the page into the coach's own and the rest. */
export const load: PageServerLoad = (event) => runLoad(event, dashboardData);
