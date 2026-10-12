import type { RequestHandler } from './$types';
import { runRoute } from '#lib/server/runtime';
import { listParts } from '#lib/server/videos';

/** Owner only: parts R2 already has for `?uploadId=`, so Uppy can resume. */
export const GET: RequestHandler = (event) => runRoute(event, listParts);
