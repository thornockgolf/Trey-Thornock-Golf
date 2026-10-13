import type { RequestHandler } from './$types';
import { startCheckout } from '#lib/server/billing';
import { runRoute } from '#lib/server/runtime';

/** Start a Stripe Checkout for the assessment or the membership. */
export const POST: RequestHandler = (event) => runRoute(event, startCheckout);
