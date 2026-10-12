import type { RequestHandler } from './$types';
import { listResults, recordResult } from '#lib/server/calendar';
import { runRoute } from '#lib/server/runtime';

export const GET: RequestHandler = (event) => runRoute(event, listResults);

/** Coach only: record a result. */
export const POST: RequestHandler = (event) => runRoute(event, recordResult);
