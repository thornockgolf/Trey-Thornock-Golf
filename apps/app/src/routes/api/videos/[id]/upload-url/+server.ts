import type { RequestHandler } from './$types';
import { runRoute } from '#lib/server/runtime';
import { reissueUpload } from '#lib/server/videos';

/** Owner only: a fresh presigned PUT for a still-pending single-request upload (the first URL expired). */
export const POST: RequestHandler = (event) => runRoute(event, reissueUpload);
