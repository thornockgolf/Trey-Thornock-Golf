import type { RequestHandler } from './$types';
import { getOverlay, putOverlay } from '#lib/server/analyses';
import { runRoute } from '#lib/server/runtime';

/** Owner or a coach who may see the video: the saved overlay setup. */
export const GET: RequestHandler = (event) => runRoute(event, getOverlay);

/** Coach only: save the overlay setup. */
export const PUT: RequestHandler = (event) => runRoute(event, putOverlay);
