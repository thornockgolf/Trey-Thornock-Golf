import type { RequestHandler } from './$types';
import { runRoute } from '#lib/server/runtime';
import { playbackVideo } from '#lib/server/videos';

/** Owner or assigned coach: short-lived signed URL for the processed video. */
export const GET: RequestHandler = (event) => runRoute(event, playbackVideo);
