import type { RequestHandler } from './$types';
import { deletePlayer } from '#lib/server/accounts';
import { runRoute } from '#lib/server/runtime';

/** Coach only: permanently delete a player's account and data (billing records are kept). */
export const POST: RequestHandler = (event) => runRoute(event, deletePlayer);
