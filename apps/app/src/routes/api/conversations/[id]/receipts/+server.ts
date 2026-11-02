import type { RequestHandler } from './$types';
import { listReceipts } from '#lib/server/chat';
import { runRoute } from '#lib/server/runtime';

/** Which of the caller's own messages the other side has read (the "Seen" markers); participants only. */
export const GET: RequestHandler = (event) => runRoute(event, listReceipts);
