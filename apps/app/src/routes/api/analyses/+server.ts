import type { RequestHandler } from './$types';
import { createAnalysis } from '#lib/server/analyses';
import { runRoute } from '#lib/server/runtime';

/** Coach only: start an analysis of a video. */
export const POST: RequestHandler = (event) => runRoute(event, createAnalysis);
