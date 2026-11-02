import type { RequestHandler } from './$types';
import { cancelMembership } from '#lib/server/billing';
import { runRoute } from '#lib/server/runtime';

export const POST: RequestHandler = (event) => runRoute(event, cancelMembership);
