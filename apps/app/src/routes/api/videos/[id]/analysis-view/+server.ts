import type { RequestHandler } from './$types';
import { getAnalysisView } from '#lib/server/analyses';
import { runRoute } from '#lib/server/runtime';

/** Coach only: whether the player has opened the analysis of this video. */
export const GET: RequestHandler = (event) => runRoute(event, getAnalysisView);
