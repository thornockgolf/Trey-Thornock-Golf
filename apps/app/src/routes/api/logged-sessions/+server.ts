import type { RequestHandler } from './$types';
import { createLoggedSession, listLoggedSessions } from '#lib/server/logged-sessions';
import { runRoute } from '#lib/server/runtime';

/** Player: their logged (extra) sessions. Coach: `?playerId=` for an assigned player, read only. */
export const GET: RequestHandler = (event) => runRoute(event, listLoggedSessions);

/** Player only: log a session that is not on the plan. */
export const POST: RequestHandler = (event) => runRoute(event, createLoggedSession);
