import type { RequestHandler } from './$types';
import { listPlayers } from '#lib/server/players';
import { runRoute } from '#lib/server/runtime';

/** Coach only: every player and whether the coach is working with them. */
export const GET: RequestHandler = (event) => runRoute(event, listPlayers);
