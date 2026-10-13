import { Billing, Users, type BillingTx, type Notification } from '@ttg/db';
import { CheckoutRequest, type BillingDto, type CurrentUserData } from '@ttg/shared';
import { Effect } from 'effect';
import { requireRole } from './auth';
import { decodeBody } from './decode';
import { Conflict, PaymentError } from './errors';
import { publishNotifications } from './notify';
import { RequestContext } from './request-context';
import { StripeApi, type StripeEvent } from './stripe';

const iso = (d: Date | null) => d?.toISOString() ?? null;

/** What the billing page shows, read from Postgres only (never from the success URL or anything the client says). */
export const billingFor = (userId: string) =>
	Effect.gen(function* () {
		const billing = yield* Billing;
		const [d, e] = yield* Effect.all([billing.details(userId), billing.entitlements(userId)]);
		return {
			assessmentPaid: d.assessmentPaid,
			subscription: d.subscription
				? { status: d.subscription.status, currentPeriodEnd: iso(d.subscription.currentPeriodEnd), cancelAtPeriodEnd: d.subscription.cancelAtPeriodEnd }
				: null,
			entitlements: { assessment: e.assessment, membership: e.membership, pastDue: e.pastDue, graceEndsAt: iso(e.graceEndsAt), endsAt: iso(e.endsAt) },
			payments: d.payments.map((p) => ({ id: p.id, kind: p.kind, amountCents: p.amountCents, currency: p.currency, status: p.status, paidAt: iso(p.paidAt) })),
			canManage: d.hasCustomer
		} satisfies BillingDto;
	});

/** What the shell needs on every page: whether a failed payment should show the banner. Players only. */
export const shellBilling = (user: CurrentUserData) =>
	Effect.gen(function* () {
		if (user.role !== 'player') return null;
		const e = yield* (yield* Billing).entitlements(user.id);
		return { pastDue: e.pastDue, graceEndsAt: iso(e.graceEndsAt) };
	});

/** `GET /api/billing`. Players only: coaches are not billed. */
export const getBilling = Effect.gen(function* () {
	const user = yield* requireRole('player');
	return yield* billingFor(user.id);
});

const originOf = Effect.gen(function* () {
	const { event } = yield* RequestContext;
	return event.url.origin;
});

/** `POST /api/billing/checkout`: `{ product }` -> `{ url }` of a Stripe-hosted Checkout page. */
export const startCheckout = Effect.gen(function* () {
	const user = yield* requireRole('player');
	const { product } = yield* decodeBody(CheckoutRequest);
	const billing = yield* Billing;
	const stripe = yield* StripeApi;
	const e = yield* billing.entitlements(user.id);
	const d = yield* billing.details(user.id);
	if (product === 'assessment' && d.assessmentPaid) return yield* new Conflict({ message: 'The assessment is already paid' });
	if (product === 'membership' && !e.assessment) return yield* new Conflict({ message: 'The membership comes after the Initial Performance Assessment' });
	if (product === 'membership' && (e.membership || e.pastDue)) return yield* new Conflict({ message: 'You already have a membership. Manage it from the billing page' });

	let customerId = yield* billing.customerId(user.id);
	if (!customerId) {
		const row = yield* (yield* Users).findById(user.id);
		const created = yield* stripe.createCustomer({ userId: user.id, email: row?.email ?? null, name: row?.displayName ?? null });
		customerId = yield* billing.saveCustomer(user.id, created);
	}
	const origin = yield* originOf;
	// Where Stripe sends the browser back. The success page only displays state read from Postgres.
	return yield* stripe.createCheckout({
		customerId,
		userId: user.id,
		product,
		successUrl: `${origin}/billing?checkout=success`,
		cancelUrl: `${origin}/billing?checkout=cancelled`
	});
});

/** `POST /api/billing/portal` -> `{ url }`: card changes and cancellation happen in Stripe's Customer Portal. */
export const openPortal = Effect.gen(function* () {
	const user = yield* requireRole('player');
	const customerId = yield* (yield* Billing).customerId(user.id);
	if (!customerId) return yield* new Conflict({ message: 'There is nothing to manage yet' });
	return yield* (yield* StripeApi).createPortal({ customerId, returnUrl: `${yield* originOf}/billing` });
});

// --- webhook ---------------------------------------------------------------------------------

const seconds = (n: unknown) => (typeof n === 'number' ? new Date(n * 1000) : null);
const str = (v: unknown) => (typeof v === 'string' && v.length > 0 ? v : undefined);
/** An expandable Stripe field: an id, or an object with an id. */
const idOf = (v: unknown) => (typeof v === 'string' ? v : str((v as { id?: unknown } | null | undefined)?.id));
const money = (cents: number, currency: string) => new Intl.NumberFormat('en-US', { style: 'currency', currency: currency.toUpperCase() }).format(cents / 100);

/** The subscription an invoice belongs to (the field moved under `parent` in newer Stripe API versions). */
const invoiceSubscription = (inv: Record<string, any>) => idOf(inv.parent?.subscription_details?.subscription) ?? idOf(inv.subscription);

const resolveUser = (tx: BillingTx, obj: Record<string, any>) =>
	Effect.gen(function* () {
		const customer = idOf(obj.customer);
		const byCustomer = customer ? yield* tx.userIdForCustomer(customer) : undefined;
		return byCustomer;
	});

/** Apply one verified event. Returns the notifications it wrote so they can be pushed after the commit. */
export const applyStripeEvent = (tx: BillingTx, event: StripeEvent): Effect.Effect<readonly Notification[], import('@ttg/db').DatabaseError> =>
	Effect.gen(function* () {
		const obj = event.data.object;
		const at = new Date(event.created * 1000);
		const notes: Notification[] = [];
		const pair = (userId: string, name: string | undefined) =>
			Effect.gen(function* () {
				const paired = yield* tx.pairWithCoach(userId);
				if (!paired) return;
				notes.push(yield* tx.notify(userId, 'coach_assigned', { coachId: paired.coachId }));
				notes.push(yield* tx.notify(paired.coachId, 'new_player', { playerId: userId, playerName: name ?? 'A new player' }));
			});

		switch (event.type) {
			case 'checkout.session.completed':
			case 'checkout.session.async_payment_succeeded': {
				const userId = yield* resolveUser(tx, obj);
				if (!userId) return notes;
				if (obj.mode === 'payment' && obj.payment_status === 'paid' && obj.metadata?.product === 'assessment') {
					const pi = idOf(obj.payment_intent);
					if (pi)
						yield* tx.recordPayment({
							userId,
							kind: 'assessment',
							stripePaymentIntentId: pi,
							amountCents: typeof obj.amount_total === 'number' ? obj.amount_total : 0,
							currency: str(obj.currency) ?? 'usd',
							status: 'paid',
							paidAt: at
						});
					yield* pair(userId, str(obj.customer_details?.name));
				} else if (obj.mode === 'subscription') {
					yield* pair(userId, str(obj.customer_details?.name));
				}
				return notes;
			}
			case 'customer.subscription.created':
			case 'customer.subscription.updated':
			case 'customer.subscription.deleted': {
				const userId = yield* resolveUser(tx, obj);
				const subscriptionId = str(obj.id);
				const item = obj.items?.data?.[0];
				const priceId = idOf(item?.price);
				const customerId = idOf(obj.customer);
				if (!userId || !subscriptionId || !priceId || !customerId) return notes;
				yield* tx.upsertSubscription({
					userId,
					stripeSubscriptionId: subscriptionId,
					stripeCustomerId: customerId,
					priceId,
					status: event.type === 'customer.subscription.deleted' ? 'canceled' : (str(obj.status) ?? 'incomplete'),
					// current_period_end moved from the subscription to its items in newer API versions
					currentPeriodEnd: seconds(item?.current_period_end ?? obj.current_period_end),
					cancelAtPeriodEnd: obj.cancel_at_period_end === true,
					eventCreatedAt: at
				});
				return notes;
			}
			case 'invoice.paid': {
				const userId = yield* resolveUser(tx, obj);
				const invoiceId = str(obj.id);
				if (!userId || !invoiceId || !invoiceSubscription(obj)) return notes;
				yield* tx.recordPayment({
					userId,
					kind: 'membership',
					stripeInvoiceId: invoiceId,
					amountCents: typeof obj.amount_paid === 'number' ? obj.amount_paid : 0,
					currency: str(obj.currency) ?? 'usd',
					status: 'paid',
					paidAt: seconds(obj.status_transitions?.paid_at) ?? at
				});
				return notes;
			}
			case 'invoice.payment_failed': {
				const userId = yield* resolveUser(tx, obj);
				const invoiceId = str(obj.id);
				const subscriptionId = invoiceSubscription(obj);
				if (!userId || !invoiceId || !subscriptionId) return notes;
				const cents = typeof obj.amount_due === 'number' ? obj.amount_due : 0;
				const currency = str(obj.currency) ?? 'usd';
				yield* tx.recordPayment({ userId, kind: 'membership', stripeInvoiceId: invoiceId, amountCents: cents, currency, status: 'failed', paidAt: null });
				yield* tx.markPastDue(subscriptionId, at);
				notes.push(yield* tx.notify(userId, 'payment_issue', { message: `Your payment of ${money(cents, currency)} failed. Update your card to keep your membership`, invoiceId }));
				return notes;
			}
			default:
				return notes; // logged in stripe_events and otherwise ignored
		}
	});

const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

/**
 * `POST /webhooks/stripe`: no Clerk session. The signature over the raw body is the only credential;
 * an invalid one gets 400 and nothing is written. Each event id is handled once.
 */
export const stripeWebhook = Effect.gen(function* () {
	const { event: req } = yield* RequestContext;
	const raw = yield* Effect.tryPromise({ try: () => req.request.text(), catch: () => new PaymentError({ message: 'Unreadable body' }) });
	const verified = yield* (yield* StripeApi).constructEvent(raw, req.request.headers.get('stripe-signature')).pipe(Effect.result);
	if (verified._tag === 'Failure') return reply(400, { code: 'InvalidSignature', message: 'Invalid signature' });
	const event = verified.success;
	const outcome = yield* (yield* Billing).processEvent({ id: event.id, type: event.type }, (tx) => applyStripeEvent(tx, event));
	if (outcome._tag === 'duplicate') return reply(200, { received: true, duplicate: true });
	yield* publishNotifications(outcome.value);
	return reply(200, { received: true });
});

