import type { RequestHandler } from './$types';
import { resumeMembership } from '#lib/server/billing';
import { runRoute } from '#lib/server/runtime';

export const POST: RequestHandler = (event) => runRoute(event, resumeMembership);
