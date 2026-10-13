import type { RequestHandler } from './$types';
import { listMessages, sendMessage } from '#lib/server/chat';
import { runRoute } from '#lib/server/runtime';

/** Participants only: list (with an `after` cursor for catch-up) and send. */
export const GET: RequestHandler = (event) => runRoute(event, listMessages);
export const POST: RequestHandler = (event) => runRoute(event, sendMessage);
