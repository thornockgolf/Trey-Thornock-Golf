import type { RequestHandler } from './$types';
import { unsubscribePush } from '#lib/server/push';
import { runRoute } from '#lib/server/runtime';

export const POST: RequestHandler = (event) => runRoute(event, unsubscribePush);
