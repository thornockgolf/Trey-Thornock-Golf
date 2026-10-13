import { Billing, Chat, Coaching, Db, Notifications, Realtime, Users } from '@ttg/db';
import { TestDb } from '@ttg/db/testing';
import { Effect, Layer, ManagedRuntime } from 'effect';
import Stripe from 'stripe';
import { afterAll, describe, expect, it } from 'vitest';
import { CoachAllowlist } from './auth';
import { getBilling, openPortal, startCheckout, stripeWebhook } from './billing';
import { listNotifications } from './notifications';
import { makeRunRoute } from './run-route';
import { StripeApi } from './stripe';
import { fakeEvent } from './test-utils';

// Integration: Checkout, the Portal and the webhook on a real database. The Stripe API client is a recording stand-in;
// signature checking is the real Stripe library.
const SECRET = 'whsec_test_secret';
const calls: { fn: string; args: any }[] = [];
const client = {
	customers: { create: async (args: any) => (calls.push({ fn: 'customer', args }), { id: `cus_${calls.length}` }) },
	checkout: { sessions: { create: async (args: any) => (calls.push({ fn: 'checkout', args }), { url: 'https://checkout.stripe.test/s/1' }) } },
	billingPortal: { sessions: { create: async (args: any) => (calls.push({ fn: 'portal', args }), { url: 'https://billing.stripe.test/p/1' }) } }
} as unknown as Stripe;
const published: { topic: string; event: string }[] = [];
const fakeFetch = (async (_u: string, init: { body: string }) => {
	for (const m of JSON.parse(init.body).messages) published.push(m);
	return new Response(null, { status: 202 });
}) as unknown as typeof fetch;

const Services = Layer.mergeAll(Users.layer, Coaching.layer, Chat.layer, Notifications.layer, Billing.layer).pipe(Layer.provideMerge(TestDb));
const rt = ManagedRuntime.make(
	Layer.mergeAll(
		CoachAllowlist.layerFromCsv('coach_a'),
		StripeApi.layerFromConfig({ secretKey: 'sk_test_x', webhookSecret: SECRET, assessmentPriceId: 'price_assessment', membershipPriceId: 'price_membership', client }),
		Realtime.layerEnabled({ url: 'http://rt.test', serviceRoleKey: 's', jwtSecret: 'j', anonKey: 'a', fetch: fakeFetch })
	).pipe(Layer.provideMerge(Services))
);
const run = makeRunRoute(rt);
afterAll(() => rt.dispose());

const call = async (effect: Effect.Effect<any, any, any>, user: string | null, o: { body?: unknown } = {}) => {
	const res = await run(fakeEvent({ userId: user, body: o.body }), effect as never);
	return { status: res.status, body: (await res.json()) as any };
};
const user = (clerk: string, role: 'player' | 'coach' = 'player') => rt.runPromise(Effect.flatMap(Users, (u) => u.ensure({ clerkUserId: clerk, role })));

let n = 0;
const T0 = 1_790_000_000;
/** Deliver a Stripe event to the webhook as Stripe would: raw JSON body, signed. */
const deliver = async (type: string, object: Record<string, unknown>, o: { id?: string; created?: number; secret?: string; signature?: string | null } = {}) => {
	const payload = JSON.stringify({ id: o.id ?? `evt_${++n}`, object: 'event', type, created: o.created ?? T0 + n, data: { object } });
	const header = o.signature === null ? undefined : (o.signature ?? await Stripe.webhooks.generateTestHeaderStringAsync({ payload, secret: o.secret ?? SECRET }));
	const res = await run(fakeEvent({ userId: null, rawBody: payload, headers: header ? { 'stripe-signature': header } : {} }), stripeWebhook as never);
	return { status: res.status, body: (await res.json()) as any };
};
const count = (sql: string, params: unknown[] = []) => rt.runPromise(Effect.flatMap(Effect.service(Db), (d) => d.query<{ n: string }>(sql, params))).then((r) => r.length);

const assessmentSession = (customer: string, userId: string, over: Record<string, unknown> = {}) => ({
	id: 'cs_1', mode: 'payment', payment_status: 'paid', customer, client_reference_id: userId, payment_intent: `pi_${customer}`, amount_total: 14900, currency: 'usd',
	metadata: { userId, product: 'assessment' }, customer_details: { name: 'Sam Rivera' }, ...over
});
const subscriptionObject = (customer: string, over: Record<string, unknown> = {}) => ({
	id: `sub_${customer}`, customer, status: 'active', cancel_at_period_end: false,
	items: { data: [{ price: { id: 'price_membership' }, current_period_end: T0 + 30 * 86_400 }] }, ...over
});
const invoiceObject = (customer: string, over: Record<string, unknown> = {}) => ({
	id: `in_${customer}_${++n}`, customer, amount_paid: 4900, amount_due: 4900, currency: 'usd', status_transitions: { paid_at: T0 },
	parent: { subscription_details: { subscription: `sub_${customer}` } }, ...over
});
/** A player who has started Checkout, so Stripe events can be matched to them. */
const customerFor = async (tag: string) => {
	const p = await user(`pl_${tag}`);
	const r = await call(startCheckout, `pl_${tag}`, { body: { product: 'assessment' } });
	expect(r.status).toBe(200);
	return { p, customer: calls.filter((c) => c.fn === 'customer').at(-1) ? `cus_${calls.findLastIndex((c) => c.fn === 'customer') + 1}` : '' };
};

describe('POST /api/billing/checkout', () => {
	it('only players pay, and the membership comes after the assessment', async () => {
		await user('coach_a', 'coach');
		await user('pl_k1');
		expect((await call(startCheckout, 'coach_a', { body: { product: 'assessment' } })).status).toBe(403);
		expect((await call(startCheckout, null, { body: { product: 'assessment' } })).status).toBe(401);
		expect((await call(startCheckout, 'pl_k1', { body: { product: 'nope' } })).status).toBe(422);
		const early = await call(startCheckout, 'pl_k1', { body: { product: 'membership' } });
		expect(early.status).toBe(409);
		expect(early.body.message).toMatch(/after the Initial Performance Assessment/);
	});

	it('creates one Stripe customer, sends the assessment as a one-time payment and the membership as a subscription', async () => {
		const { p, customer } = await customerFor('k2');
		const checkout = calls.findLast((c) => c.fn === 'checkout')!.args;
		expect(checkout).toMatchObject({
			mode: 'payment', customer, client_reference_id: p.id, line_items: [{ price: 'price_assessment', quantity: 1 }],
			success_url: 'http://localhost/billing?checkout=success', cancel_url: 'http://localhost/billing?checkout=cancelled', metadata: { userId: p.id, product: 'assessment' }
		});
		const customersBefore = calls.filter((c) => c.fn === 'customer').length;
		await call(startCheckout, 'pl_k2', { body: { product: 'assessment' } });
		expect(calls.filter((c) => c.fn === 'customer').length).toBe(customersBefore); // reused
		// pay, then the membership is offered
		await deliver('checkout.session.completed', assessmentSession(customer, p.id));
		const sub = await call(startCheckout, 'pl_k2', { body: { product: 'membership' } });
		expect(sub.body).toEqual({ url: 'https://checkout.stripe.test/s/1' });
		expect(calls.findLast((c) => c.fn === 'checkout')!.args).toMatchObject({ mode: 'subscription', line_items: [{ price: 'price_membership', quantity: 1 }] });
		expect((await call(startCheckout, 'pl_k2', { body: { product: 'assessment' } })).status).toBe(409); // already paid
	});

	it('answers 402 when billing is not configured', async () => {
		const bare = ManagedRuntime.make(
			Layer.mergeAll(CoachAllowlist.layerFromCsv(''), StripeApi.layerFromConfig({ secretKey: undefined, webhookSecret: undefined, assessmentPriceId: undefined, membershipPriceId: undefined })).pipe(Layer.provideMerge(Services))
		);
		const res = await makeRunRoute(bare)(fakeEvent({ userId: 'pl_k3', body: { product: 'assessment' } }), startCheckout as never);
		expect(res.status).toBe(402);
		await bare.dispose();
	});
});

describe('POST /webhooks/stripe', () => {
	it('rejects a forged or missing signature with 400 and writes nothing', async () => {
		const { p, customer } = await customerFor('w1');
		const before = await count(`select 1 from stripe_events`);
		const body = assessmentSession(customer, p.id);
		expect((await deliver('checkout.session.completed', body, { secret: 'whsec_wrong' })).status).toBe(400);
		expect((await deliver('checkout.session.completed', body, { signature: 't=1,v1=deadbeef' })).status).toBe(400);
		expect((await deliver('checkout.session.completed', body, { signature: null })).status).toBe(400);
		expect(await count(`select 1 from stripe_events`)).toBe(before);
		expect(await count(`select 1 from payments where user_id = $1`, [p.id])).toBe(0);
		// a tampered body with a signature made for another body
		const payload = JSON.stringify({ id: 'evt_t', type: 'checkout.session.completed', created: T0, data: { object: body } });
		const header = await Stripe.webhooks.generateTestHeaderStringAsync({ payload: payload + ' ', secret: SECRET });
		expect((await run(fakeEvent({ userId: null, rawBody: payload, headers: { 'stripe-signature': header } }), stripeWebhook as never)).status).toBe(400);
	});

	it('does not need a session: a signed event from an anonymous caller is accepted', async () => {
		expect((await deliver('ping.unknown', {})).status).toBe(200);
	});

	it('the assessment payment records the payment, unlocks the player, pairs them with the coach and notifies both', async () => {
		await user('coach_a', 'coach');
		const { p, customer } = await customerFor('w2');
		published.length = 0;
		expect((await call(getBilling, 'pl_w2')).body.entitlements).toMatchObject({ assessment: false, membership: false });
		expect((await deliver('checkout.session.completed', assessmentSession(customer, p.id))).status).toBe(200);
		const b = await call(getBilling, 'pl_w2');
		expect(b.body.assessmentPaid).toBe(true);
		expect(b.body.entitlements).toMatchObject({ assessment: true, membership: false });
		expect(b.body.payments).toEqual([expect.objectContaining({ kind: 'assessment', amountCents: 14900, currency: 'usd', status: 'paid' })]);
		expect(await count(`select 1 from coach_assignments where player_id = $1 and status = 'active'`, [p.id])).toBe(1);
		expect(await count(`select 1 from conversations where player_id = $1`, [p.id])).toBe(1);
		expect((await call(listNotifications, 'pl_w2')).body.notifications.map((x: any) => x.type)).toContain('coach_assigned');
		expect((await call(listNotifications, 'coach_a')).body.notifications.filter((x: any) => x.type === 'new_player' && x.payload.playerId === p.id)).toHaveLength(1);
		expect(published.filter((x) => x.event === 'notification.created')).toHaveLength(2);
	});

	it('ignores a repeated event id: one payment, one set of notifications', async () => {
		const { p, customer } = await customerFor('w3');
		const first = await deliver('checkout.session.completed', assessmentSession(customer, p.id), { id: 'evt_dup' });
		const again = await deliver('checkout.session.completed', assessmentSession(customer, p.id), { id: 'evt_dup' });
		expect(first.body).toEqual({ received: true });
		expect(again.body).toEqual({ received: true, duplicate: true });
		expect(await count(`select 1 from payments where user_id = $1`, [p.id])).toBe(1);
		expect(await count(`select 1 from stripe_events where event_id = 'evt_dup'`)).toBe(1);
		expect((await call(listNotifications, 'pl_w3')).body.notifications.filter((x: any) => x.type === 'coach_assigned')).toHaveLength(1);
	});

	it('an unpaid session does not unlock anything', async () => {
		const { p, customer } = await customerFor('w4');
		await deliver('checkout.session.completed', assessmentSession(customer, p.id, { payment_status: 'unpaid' }));
		expect((await call(getBilling, 'pl_w4')).body.entitlements.assessment).toBe(false);
	});

	it('the success page itself changes nothing: state only moves with webhooks', async () => {
		await customerFor('w5');
		// the player returns from Checkout (success URL) without a webhook having arrived
		const b = await call(getBilling, 'pl_w5');
		expect(b.body).toMatchObject({ assessmentPaid: false, subscription: null, entitlements: { assessment: false, membership: false } });
	});

	it('subscribing sets the status to active; renewal failure makes it past_due with a notification; paying again recovers', async () => {
		const { p, customer } = await customerFor('w6');
		await deliver('checkout.session.completed', assessmentSession(customer, p.id));
		await deliver('checkout.session.completed', { id: 'cs_2', mode: 'subscription', customer, metadata: { userId: p.id, product: 'membership' } });
		await deliver('customer.subscription.created', subscriptionObject(customer));
		await deliver('invoice.paid', invoiceObject(customer));
		let b = (await call(getBilling, 'pl_w6')).body;
		expect(b.subscription).toMatchObject({ status: 'active', cancelAtPeriodEnd: false });
		expect(b.entitlements.membership).toBe(true);
		expect(b.payments.map((x: any) => x.kind).sort()).toEqual(['assessment', 'membership']);

		await deliver('invoice.payment_failed', invoiceObject(customer, { id: 'in_fail', amount_due: 4900 }));
		b = (await call(getBilling, 'pl_w6')).body;
		expect(b.subscription.status).toBe('past_due');
		expect(b.entitlements).toMatchObject({ pastDue: true, membership: true });
		expect(b.entitlements.graceEndsAt).not.toBeNull();
		expect(b.payments.find((x: any) => x.status === 'failed')).toBeDefined();
		const issue = (await call(listNotifications, 'pl_w6')).body.notifications.find((x: any) => x.type === 'payment_issue');
		expect(issue.payload.message).toMatch(/\$49\.00 failed/);

		await deliver('invoice.paid', invoiceObject(customer, { id: 'in_fail' }));
		await deliver('customer.subscription.updated', subscriptionObject(customer, { status: 'active' }));
		b = (await call(getBilling, 'pl_w6')).body;
		expect(b.subscription.status).toBe('active');
		expect(b.entitlements).toMatchObject({ pastDue: false, membership: true, graceEndsAt: null });
		expect(b.payments.find((x: any) => x.status === 'failed')).toBeUndefined(); // the same invoice, now paid
	});

	it('a cancelled membership lasts until the period the player paid for ends', async () => {
		const { p, customer } = await customerFor('w7');
		await deliver('checkout.session.completed', assessmentSession(customer, p.id));
		await deliver('customer.subscription.created', subscriptionObject(customer));
		await deliver('customer.subscription.updated', subscriptionObject(customer, { cancel_at_period_end: true }), { created: T0 + 100 });
		let b = (await call(getBilling, 'pl_w7')).body;
		expect(b.subscription.cancelAtPeriodEnd).toBe(true);
		expect(b.entitlements.membership).toBe(true);
		expect(b.entitlements.endsAt).not.toBeNull();
		await deliver('customer.subscription.deleted', subscriptionObject(customer, { status: 'canceled' }), { created: T0 + 200 });
		b = (await call(getBilling, 'pl_w7')).body;
		expect(b.subscription.status).toBe('canceled');
		await rt.runPromise(Effect.flatMap(Effect.service(Db), (d) => d.query(`update subscriptions set current_period_end = now() - interval '1 day' where user_id = $1`, [p.id])));
		expect((await call(getBilling, 'pl_w7')).body.entitlements.membership).toBe(false);
		expect((await call(getBilling, 'pl_w7')).body.entitlements.assessment).toBe(true);
	});

	it('an older subscription event delivered late does not undo a newer one', async () => {
		const { p, customer } = await customerFor('w8');
		await deliver('checkout.session.completed', assessmentSession(customer, p.id));
		await deliver('customer.subscription.updated', subscriptionObject(customer, { status: 'canceled' }), { created: T0 + 500 });
		await deliver('customer.subscription.updated', subscriptionObject(customer, { status: 'active' }), { created: T0 + 400 });
		expect((await call(getBilling, 'pl_w8')).body.subscription.status).toBe('canceled');
	});

	it('events for customers we did not create are acknowledged and ignored', async () => {
		const r = await deliver('customer.subscription.created', subscriptionObject('cus_unknown'));
		expect(r.status).toBe(200);
		expect(await count(`select 1 from subscriptions where stripe_customer_id = 'cus_unknown'`)).toBe(0);
	});

	it('answers 500 (so Stripe retries) when handling fails, and leaves no half-written state', async () => {
		const { p, customer } = await customerFor('w9');
		// a payment row with an amount that violates the check constraint fails inside the transaction
		const r = await deliver('checkout.session.completed', assessmentSession(customer, p.id, { amount_total: -5 }), { id: 'evt_bad' });
		expect(r.status).toBe(500);
		expect(await count(`select 1 from stripe_events where event_id = 'evt_bad'`)).toBe(0);
		expect(await count(`select 1 from coach_assignments where player_id = $1`, [p.id])).toBe(0);
	});
});

describe('POST /api/billing/portal', () => {
	it('needs a customer, and sends the player back to /billing', async () => {
		await user('pl_p1');
		expect((await call(openPortal, 'pl_p1')).status).toBe(409);
		const { customer } = await customerFor('p2');
		const r = await call(openPortal, 'pl_p2');
		expect(r.body).toEqual({ url: 'https://billing.stripe.test/p/1' });
		expect(calls.findLast((c) => c.fn === 'portal')!.args).toEqual({ customer, return_url: 'http://localhost/billing' });
		expect((await call(openPortal, 'coach_a')).status).toBe(403);
	});
});
