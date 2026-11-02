import type { RequestHandler } from './$types';
import { recordAnalysisView } from '#lib/server/analyses';
import { runRoute } from '#lib/server/runtime';

/** The owning player opened the coach's analysis: records the first and last time. Idempotent; a no-op for anyone else. */
export const POST: RequestHandler = (event) => runRoute(event, recordAnalysisView);
