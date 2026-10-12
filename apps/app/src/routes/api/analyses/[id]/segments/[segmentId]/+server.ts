import type { RequestHandler } from './$types';
import { runRoute } from '#lib/server/runtime';
import { getSegment } from '#lib/server/segments';

/** Coach only: one segment's status. */
export const GET: RequestHandler = (event) => runRoute(event, getSegment);
