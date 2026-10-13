import type { RequestHandler } from './$types';
import { openPortal } from '#lib/server/billing';
import { runRoute } from '#lib/server/runtime';

/** Open Stripe's Customer Portal (card, cancel). */
export const POST: RequestHandler = (event) => runRoute(event, openPortal);
