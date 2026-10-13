import type { RequestHandler } from './$types';
import { runRoute } from '#lib/server/runtime';
import { stripeWebhook } from '#lib/server/billing';

/** Stripe's webhook: public, authenticated by the signature over the raw body. The only writer of payment state. */
export const POST: RequestHandler = (event) => runRoute(event, stripeWebhook);
