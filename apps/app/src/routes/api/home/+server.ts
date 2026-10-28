import type { RequestHandler } from './$types';
import { homeData } from '#lib/server/plans';
import { runRoute } from '#lib/server/runtime';

/** Player only: today's lesson and the roadmap phases. */
export const GET: RequestHandler = (event) => runRoute(event, homeData);
