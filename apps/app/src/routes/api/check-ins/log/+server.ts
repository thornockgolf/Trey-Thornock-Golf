import type { RequestHandler } from './$types';
import { logCheckIn } from '#lib/server/calendar';
import { runRoute } from '#lib/server/runtime';

/** Player only (membership): log a check-in of your own, already submitted. */
export const POST: RequestHandler = (event) => runRoute(event, logCheckIn);
