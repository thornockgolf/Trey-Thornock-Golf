import type { RequestHandler } from './$types';
import { createFeedback, listFeedback } from '#lib/server/feedback';
import { gated } from '#lib/server/feedback-flag';
import { runRoute } from '#lib/server/runtime';

// TEMPORARY dev tool: see docs/system/feedback.md.
export const GET: RequestHandler = (event) => runRoute(event, gated(listFeedback));
export const POST: RequestHandler = (event) => runRoute(event, gated(createFeedback));
