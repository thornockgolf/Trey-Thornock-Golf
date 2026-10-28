import type { RequestHandler } from './$types';
import { getFeedback, updateFeedback } from '#lib/server/feedback';
import { gated } from '#lib/server/feedback-flag';
import { runRoute } from '#lib/server/runtime';

export const GET: RequestHandler = (event) => runRoute(event, gated(getFeedback));
export const PATCH: RequestHandler = (event) => runRoute(event, gated(updateFeedback));
