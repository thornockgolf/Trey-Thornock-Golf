import type { RequestHandler } from './$types';
import { deleteAnnotation, updateAnnotation } from '#lib/server/annotations';
import { runRoute } from '#lib/server/runtime';

/** Coach only: change time range or shape; 409 when `version` is stale. */
export const PATCH: RequestHandler = (event) => runRoute(event, updateAnnotation);

/** Coach only. */
export const DELETE: RequestHandler = (event) => runRoute(event, deleteAnnotation);
