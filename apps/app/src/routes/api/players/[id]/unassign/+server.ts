import type { RequestHandler } from './$types';
import { unassignPlayer } from '#lib/server/players';
import { runRoute } from '#lib/server/runtime';

/** Coach only: end the coaching relationship. */
export const POST: RequestHandler = (event) => runRoute(event, unassignPlayer);
