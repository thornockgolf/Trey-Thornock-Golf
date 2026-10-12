import type { RequestHandler } from './$types';
import { runRoute } from '#lib/server/runtime';
import { undoSegments } from '#lib/server/segments';

/** Coach only: reverse the latest re-record (within 30 days). */
export const POST: RequestHandler = (event) => runRoute(event, undoSegments);
