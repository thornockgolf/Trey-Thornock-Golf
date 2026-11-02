import type { RequestHandler } from './$types';
import { listFavorites } from '#lib/server/plans';
import { runRoute } from '#lib/server/runtime';

/** Player: their starred sessions and drills. */
export const GET: RequestHandler = (event) => runRoute(event, listFavorites);
