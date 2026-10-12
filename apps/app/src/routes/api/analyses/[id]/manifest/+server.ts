import type { RequestHandler } from './$types';
import { runRoute } from '#lib/server/runtime';
import { getManifest } from '#lib/server/segments';

/** Owner of the video or a coach who may see it: the live segments with signed URLs, in order. */
export const GET: RequestHandler = (event) => runRoute(event, getManifest);
