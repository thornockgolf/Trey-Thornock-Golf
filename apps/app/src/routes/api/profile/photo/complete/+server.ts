import type { RequestHandler } from './$types';
import { completePhotoUpload } from '#lib/server/profile';
import { runRoute } from '#lib/server/runtime';

/** Player only: the photo is uploaded; verify it and use it. */
export const POST: RequestHandler = (event) => runRoute(event, completePhotoUpload);
