import type { RequestHandler } from './$types';
import { scheduleAssessment } from '#lib/server/calendar';
import { runRoute } from '#lib/server/runtime';

/** Coach only: put a test on an assigned player's calendar. */
export const POST: RequestHandler = (event) => runRoute(event, scheduleAssessment);
