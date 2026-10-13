import type { RequestHandler } from './$types';
import { getPushConfig } from '#lib/server/push';
import { runRoute } from '#lib/server/runtime';

export const GET: RequestHandler = (event) => runRoute(event, getPushConfig);
