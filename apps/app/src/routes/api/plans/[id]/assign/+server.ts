import type { RequestHandler } from './$types';
import { assignPlan } from '#lib/server/plans';
import { runRoute } from '#lib/server/runtime';

/** Coach only: assign a plan to one of their players from a start date; the player is notified. */
export const POST: RequestHandler = (event) => runRoute(event, assignPlan);
