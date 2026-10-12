import type { RequestHandler } from './$types';
import { runRoute } from '#lib/server/runtime';
import { completeVideo } from '#lib/server/videos';

/** Owner only: verify the object exists in R2, mark uploaded, enqueue processing. */
export const POST: RequestHandler = (event) => runRoute(event, completeVideo);
