import type { RequestHandler } from './$types';
import { markConversationRead } from '#lib/server/chat';
import { runRoute } from '#lib/server/runtime';

/** The user opened the conversation: clear its unread count. */
export const POST: RequestHandler = (event) => runRoute(event, markConversationRead);
