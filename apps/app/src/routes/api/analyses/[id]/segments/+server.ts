import type { RequestHandler } from './$types';
import { runRoute } from '#lib/server/runtime';
import { createSegment, listSegments } from '#lib/server/segments';

/** Coach only: the segments that make up the analysis (optionally with the annotation count for a range). */
export const GET: RequestHandler = (event) => runRoute(event, listSegments);

/** Coach only: record or re-record a range. Returns a presigned PUT for the recording. */
export const POST: RequestHandler = (event) => runRoute(event, createSegment);
