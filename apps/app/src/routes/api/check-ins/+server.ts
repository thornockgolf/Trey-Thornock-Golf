import type { RequestHandler } from './$types';
import { listCheckIns, scheduleCheckIn } from '#lib/server/calendar';
import { runRoute } from '#lib/server/runtime';

export const GET: RequestHandler = (event) => runRoute(event, listCheckIns);

/** Coach only: schedule a check-in for an assigned player. */
export const POST: RequestHandler = (event) => runRoute(event, scheduleCheckIn);
