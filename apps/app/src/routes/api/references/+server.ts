import type { RequestHandler } from './$types';
import { runRoute } from '#lib/server/runtime';
import { listReferences } from '#lib/server/videos';

/** Any signed-in user: the coach's reference (pro) library. */
export const GET: RequestHandler = (event) => runRoute(event, listReferences);
