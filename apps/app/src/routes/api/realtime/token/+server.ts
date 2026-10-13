import type { RequestHandler } from './$types';
import { mintRealtimeToken } from '#lib/server/realtime';
import { runRoute } from '#lib/server/runtime';

/** A short-lived Realtime token for one channel the caller may be on. */
export const POST: RequestHandler = (event) => runRoute(event, mintRealtimeToken);
