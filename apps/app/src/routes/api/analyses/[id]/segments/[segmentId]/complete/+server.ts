import type { RequestHandler } from './$types';
import { runRoute } from '#lib/server/runtime';
import { completeSegment } from '#lib/server/segments';

/** Coach only: the recording is uploaded; verify it and queue processing. */
export const POST: RequestHandler = (event) => runRoute(event, completeSegment);
