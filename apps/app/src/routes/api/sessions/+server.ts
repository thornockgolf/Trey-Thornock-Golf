import type { RequestHandler } from './$types';
import { listMySessions } from '#lib/server/plans';
import { runRoute } from '#lib/server/runtime';

/** Player: their scheduled practice sessions, by date. */
export const GET: RequestHandler = (event) => runRoute(event, listMySessions);
