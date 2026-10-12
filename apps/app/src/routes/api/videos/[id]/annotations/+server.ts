import type { RequestHandler } from './$types';
import { createAnnotation, listAnnotations } from '#lib/server/annotations';
import { runRoute } from '#lib/server/runtime';

/** Owner or assigned coach: the video's annotations. */
export const GET: RequestHandler = (event) => runRoute(event, listAnnotations);

/** Coach only: add an annotation (normalized shape JSON plus start and end in ms). */
export const POST: RequestHandler = (event) => runRoute(event, createAnnotation);
