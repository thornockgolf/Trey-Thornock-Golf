import type { RequestHandler } from './$types';
import { listConversations } from '#lib/server/chat';
import { runRoute } from '#lib/server/runtime';

/** The signed-in user's conversations. */
export const GET: RequestHandler = (event) => runRoute(event, listConversations);
