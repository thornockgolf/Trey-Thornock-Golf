import type { RequestHandler } from './$types';
import { submitCheckIn } from '#lib/server/calendar';
import { runRoute } from '#lib/server/runtime';

/** Player only: submit your own check-in (once). */
export const PATCH: RequestHandler = (event) => runRoute(event, submitCheckIn);
