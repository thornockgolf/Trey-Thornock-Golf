import type { RequestHandler } from './$types';
import { assignPlayer } from '#lib/server/players';
import { runRoute } from '#lib/server/runtime';

/** Coach only: start (or resume) coaching this player. */
export const POST: RequestHandler = (event) => runRoute(event, assignPlayer);
