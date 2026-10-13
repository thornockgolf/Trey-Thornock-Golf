import type { RequestHandler } from './$types';
import { requestPhotoUpload } from '#lib/server/profile';
import { runRoute } from '#lib/server/runtime';

/** Player only: a presigned PUT for your photo (image types and size are checked here). */
export const POST: RequestHandler = (event) => runRoute(event, requestPhotoUpload);
