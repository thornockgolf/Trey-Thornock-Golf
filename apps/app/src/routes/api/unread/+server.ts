import type { RequestHandler } from './$types';
import { getUnread } from '#lib/server/chat';
import { runRoute } from '#lib/server/runtime';

/** Unread message and notification counts for the nav badges. */
export const GET: RequestHandler = (event) => runRoute(event, getUnread);
