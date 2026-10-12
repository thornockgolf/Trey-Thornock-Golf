import type { RequestHandler } from './$types';
import { getPlan, updatePlan } from '#lib/server/plans';
import { runRoute } from '#lib/server/runtime';

/** Coach only. */
export const GET: RequestHandler = (event) => runRoute(event, getPlan);

/** Coach only: rename or restructure a plan template. */
export const PATCH: RequestHandler = (event) => runRoute(event, updatePlan);
