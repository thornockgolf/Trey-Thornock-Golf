import type { RequestHandler } from './$types';
import { runRoute } from '#lib/server/runtime';
import { downloadVideo } from '#lib/server/videos';

/** Owner or assigned coach: signed attachment URL for `?variant=processed|original`. */
export const GET: RequestHandler = (event) => runRoute(event, downloadVideo);
