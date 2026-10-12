import type { RequestHandler } from './$types';
import { getCalendar } from '#lib/server/calendar';
import { runRoute } from '#lib/server/runtime';

/** A player's sessions, check-ins and tests. Players read their own; coaches add `?playerId=` for an assigned player. */
export const GET: RequestHandler = (event) => runRoute(event, getCalendar);
