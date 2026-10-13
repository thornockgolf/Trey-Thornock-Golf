import Stripe from 'stripe';
import type { Product } from '@ttg/shared';
import { Context, Effect, Layer } from 'effect';
import { PaymentError, UpstreamError } from './errors';

/** The part of a Stripe event the handler reads. `data.object` is checked field by field where it is used. */
export interface StripeEvent {
	readonly id: string;
	readonly type: string;
	/** Seconds since the epoch. */
	readonly created: number;
	readonly data: { readonly object: Record<string, any> };
}

export interface StripeConfig {
	readonly secretKey: string | undefined;
	readonly webhookSecret: string | undefined;
	readonly assessmentPriceId: string | undefined;
	readonly membershipPriceId: string | undefined;
	/** For tests: a stand-in for the API client (Checkout, Portal, customers). Signature checking is always the real one. */
	readonly client?: Pick<Stripe, 'customers' | 'checkout' | 'billingPortal'>;
}

export class InvalidSignature extends Error {
	override readonly name = 'InvalidSignature';
}

/**
 * Stripe from the app server: Checkout and the Customer Portal (so the browser never holds a
 * secret), and signature verification for the webhook. Payment state is not written here; only the
 * webhook handler records it.
 */
export class StripeApi extends Context.Service<
	StripeApi,
	{
		readonly configured: boolean;
		readonly createCustomer: (input: { userId: string; email: string | null; name: string | null }) => Effect.Effect<string, PaymentError>;
		readonly createCheckout: (input: {
			customerId: string;
			userId: string;
			product: Product;
			successUrl: string;
			cancelUrl: string;
		}) => Effect.Effect<{ url: string }, PaymentError>;
		/** Delete the Stripe customer, which cancels its subscriptions and erases its personal details (the payments stay in Stripe). A customer that is already gone counts as deleted. */
		readonly deleteCustomer: (customerId: string) => Effect.Effect<void, UpstreamError>;
		readonly createPortal: (input: { customerId: string; returnUrl: string }) => Effect.Effect<{ url: string }, PaymentError>;
		/** Verify the `Stripe-Signature` header against the raw body (5 minute tolerance). Fails with `InvalidSignature`. */
		readonly constructEvent: (rawBody: string, signature: string | null) => Effect.Effect<StripeEvent, InvalidSignature>;
	}
>()('ttg/app/StripeApi') {
	static layerFromConfig = (config: StripeConfig) =>
		Layer.sync(StripeApi, () => {
			const client = config.client ?? (config.secretKey ? new Stripe(config.secretKey, { maxNetworkRetries: 1, timeout: 15_000 }) : undefined);
			const unconfigured = () => new PaymentError({ message: 'Billing is not set up yet' });
			const call = <A>(f: (s: NonNullable<typeof client>) => Promise<A>) =>
				client
					? Effect.tryPromise({
							try: () => f(client),
							catch: (cause) => new PaymentError({ message: 'Stripe could not complete the request', cause })
						})
					: Effect.fail(unconfigured());
			const priceFor = (product: Product) => (product === 'assessment' ? config.assessmentPriceId : config.membershipPriceId);
			return StripeApi.of({
				configured: client !== undefined,
				createCustomer: ({ userId, email, name }) =>
					call((s) => s.customers.create({ email: email ?? undefined, name: name ?? undefined, metadata: { userId } })).pipe(Effect.map((c) => c.id)),
				createCheckout: ({ customerId, userId, product, successUrl, cancelUrl }) => {
					const price = priceFor(product);
					if (!price) return Effect.fail(unconfigured());
					return call((s) =>
						s.checkout.sessions.create({
							mode: product === 'assessment' ? 'payment' : 'subscription',
							customer: customerId,
							client_reference_id: userId,
							line_items: [{ price, quantity: 1 }],
							success_url: successUrl,
							cancel_url: cancelUrl,
							metadata: { userId, product },
							...(product === 'membership' ? { subscription_data: { metadata: { userId } } } : { payment_intent_data: { metadata: { userId, product } } })
						})
					).pipe(
						Effect.flatMap((session) => (session.url ? Effect.succeed({ url: session.url }) : Effect.fail(new PaymentError({ message: 'Stripe did not return a checkout page' }))))
					);
				},
				deleteCustomer: (customerId) =>
					client
						? Effect.tryPromise({
								try: () => client.customers.del(customerId),
								catch: (cause) => cause
							}).pipe(
								Effect.asVoid,
								Effect.catch((cause) =>
									(cause as { code?: string }).code === 'resource_missing'
										? Effect.void
										: Effect.fail(new UpstreamError({ message: 'Could not close the player\'s billing in Stripe. Nothing was deleted; try again.', cause }))
								)
							)
						: Effect.fail(new UpstreamError({ message: 'Stripe is not set up, so the player\'s billing cannot be closed. Nothing was deleted.' })),
				createPortal: ({ customerId, returnUrl }) =>
					call((s) => s.billingPortal.sessions.create({ customer: customerId, return_url: returnUrl })).pipe(Effect.map((p) => ({ url: p.url }))),
				// Async on purpose: under Bun the SDK picks a WebCrypto provider that cannot verify synchronously.
				constructEvent: (rawBody, signature) =>
					Effect.tryPromise({
						try: async () => {
							if (!config.webhookSecret || !signature) throw new InvalidSignature('Missing signature or secret');
							return (await Stripe.webhooks.constructEventAsync(rawBody, signature, config.webhookSecret)) as unknown as StripeEvent;
						},
						catch: (e) => (e instanceof InvalidSignature ? e : new InvalidSignature('Signature does not match'))
					})
			});
		});
}
