import type { RequestHandler } from './$types';
import { createAssessment, listAssessments } from '#lib/server/calendar';
import { runRoute } from '#lib/server/runtime';

export const GET: RequestHandler = (event) => runRoute(event, listAssessments);

/** Coach only: define a test. */
export const POST: RequestHandler = (event) => runRoute(event, createAssessment);
