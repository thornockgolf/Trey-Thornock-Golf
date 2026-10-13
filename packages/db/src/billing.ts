import { Context, Effect, Layer } from 'effect';
import { entitlementsFor, type Entitlements, type SubscriptionFacts } from '@ttg/shared';
import { defaultCoachId, startCoaching } from './coaching';
import { Db, type Queryer } from './db';
import type { DatabaseError } from './errors';
import { insertNotification, type Notification } from './notifications';

export interface SubscriptionRow {
	readonly stripeSubscriptionId: string;
	readonly priceId: string;
	readonly status: string;
	readonly currentPeriodEnd: Date | null;
	readonly pastDueSince: Date | null;
	readonly cancelAtPeriodEnd: boolean;
}

export interface PaymentRow {
	readonly id: string;
	readonly kind: 'assessment' | 'membership';
	readonly amountCents: number;
	readonly currency: string;
	readonly status: string;
	readonly paidAt: Date | null;
}

export interface SubscriptionWrite {
	readonly userId: string;
	readonly stripeSubscriptionId: string;
	readonly stripeCustomerId: string;
	readonly priceId: string;
	readonly status: string;
	readonly currentPeriodEnd: Date | null;
	readonly cancelAtPeriodEnd: boolean;
	/** When Stripe created the event: an older event never overwrites a newer one. */
	readonly eventCreatedAt: Date;
}

export interface PaymentWrite {
	readonly userId: string;
	readonly kind: 'assessment' | 'membership';
	readonly stripeInvoiceId?: string | undefined;
	readonly stripePaymentIntentId?: string | undefined;
	readonly amountCents: number;
	readonly currency: string;
	readonly status: string;
	readonly paidAt: Date | null;
}

/**
 * The writes a Stripe event may make, all inside the one transaction that also marks the event
 * processed. Only the webhook handler gets these: payment state is never written anywhere else.
 */
export interface BillingTx {
	readonly userIdForCustomer: (stripeCustomerId: string) => Effect.Effect<string | undefined, DatabaseError>;
	/** Whether the write was applied (false: a newer event already did). */
	readonly upsertSubscription: (w: SubscriptionWrite) => Effect.Effect<boolean, DatabaseError>;
	/** A renewal failed: an ongoing subscription becomes past_due (and the grace period starts). No-op if there is none. */
	readonly markPastDue: (stripeSubscriptionId: string, eventCreatedAt: Date) => Effect.Effect<void, DatabaseError>;
	readonly recordPayment: (w: PaymentWrite) => Effect.Effect<void, DatabaseError>;
	readonly notify: (userId: string, type: string, payload?: Record<string, unknown>) => Effect.Effect<Notification, DatabaseError>;
	/** Pair a paying player with the coach if they have none yet. Returns the coach and player ids to notify, or undefined. */
	readonly pairWithCoach: (playerId: string) => Effect.Effect<{ coachId: string } | undefined, DatabaseError>;
}

interface SubDbRow {
	stripe_subscription_id: string;
	price_id: string;
	status: string;
	current_period_end: Date | null;
	past_due_since: Date | null;
	cancel_at_period_end: boolean;
}
const toSub = (r: SubDbRow): SubscriptionRow => ({
	stripeSubscriptionId: r.stripe_subscription_id,
	priceId: r.price_id,
	status: r.status,
	currentPeriodEnd: r.current_period_end,
	pastDueSince: r.past_due_since,
	cancelAtPeriodEnd: r.cancel_at_period_end
});

const makeTx = (q: Queryer): BillingTx => ({
	userIdForCustomer: (customerId) =>
		q.maybeOne<{ user_id: string }>(`select user_id from stripe_customers where stripe_customer_id = $1`, [customerId]).pipe(Effect.map((r) => r?.user_id)),
	upsertSubscription: (w) =>
		q
			.query(
				`insert into subscriptions (user_id, stripe_customer_id, stripe_subscription_id, price_id, status, current_period_end, cancel_at_period_end, past_due_since, event_created_at)
				 values ($1, $2, $3, $4, $5, $6, $7, case when $5 = 'past_due' then now() end, $8)
				 on conflict (stripe_subscription_id) do update set
				   price_id = excluded.price_id, status = excluded.status, current_period_end = excluded.current_period_end,
				   cancel_at_period_end = excluded.cancel_at_period_end, event_created_at = excluded.event_created_at,
				   past_due_since = case when excluded.status = 'past_due' then coalesce(subscriptions.past_due_since, now()) end
				 where subscriptions.event_created_at is null or subscriptions.event_created_at <= excluded.event_created_at
				 returning id`,
				[w.userId, w.stripeCustomerId, w.stripeSubscriptionId, w.priceId, w.status, w.currentPeriodEnd, w.cancelAtPeriodEnd, w.eventCreatedAt]
			)
			.pipe(Effect.map((rows) => rows.length > 0)),
	markPastDue: (subscriptionId, eventCreatedAt) =>
		q
			.query(
				`update subscriptions set status = 'past_due', past_due_since = coalesce(past_due_since, now()), event_created_at = $2
				 where stripe_subscription_id = $1 and status in ('active', 'trialing', 'past_due')
				   and (event_created_at is null or event_created_at <= $2)`,
				[subscriptionId, eventCreatedAt]
			)
			.pipe(Effect.asVoid),
	recordPayment: (w) =>
		q
			.query(
				`insert into payments (user_id, kind, stripe_invoice_id, stripe_payment_intent_id, amount_cents, currency, status, paid_at)
				 values ($1, $2, $3, $4, $5, $6, $7, $8)
				 on conflict (${w.stripeInvoiceId ? 'stripe_invoice_id' : 'stripe_payment_intent_id'}) do update set
				   status = excluded.status, amount_cents = excluded.amount_cents, paid_at = coalesce(excluded.paid_at, payments.paid_at)`,
				[w.userId, w.kind, w.stripeInvoiceId ?? null, w.stripePaymentIntentId ?? null, w.amountCents, w.currency, w.status, w.paidAt]
			)
			.pipe(Effect.asVoid),
	notify: (userId, type, payload) => insertNotification(q, userId, type, payload),
	pairWithCoach: (playerId) =>
		Effect.gen(function* () {
			const active = yield* q.maybeOne(`select 1 as ok from coach_assignments where player_id = $1 and status = 'active'`, [playerId]);
			if (active) return undefined;
			const coachId = yield* defaultCoachId(q);
			if (!coachId) return undefined;
			yield* startCoaching(q, coachId, playerId);
			return { coachId };
		})
});

export class Billing extends Context.Service<
	Billing,
	{
		/** The player's Stripe customer id, if Checkout was ever started. */
		readonly customerId: (userId: string) => Effect.Effect<string | undefined, DatabaseError>;
		/** Remember the customer created for this user. If another request won the race, its id is returned instead. */
		readonly saveCustomer: (userId: string, stripeCustomerId: string) => Effect.Effect<string, DatabaseError>;
		/** What the player may use, from the webhook-written rows. */
		readonly entitlements: (userId: string, now?: Date) => Effect.Effect<Entitlements, DatabaseError>;
		readonly details: (userId: string) => Effect.Effect<{ subscription: SubscriptionRow | null; payments: readonly PaymentRow[]; hasCustomer: boolean; assessmentPaid: boolean }, DatabaseError>;
		/**
		 * Handle a Stripe event exactly once. The event row is claimed and marked processed in the same transaction as
		 * `apply`'s writes, so a crash leaves nothing behind and Stripe's retry runs it again, and a concurrent duplicate
		 * waits for the first and is then ignored. Returns `duplicate` without calling `apply` for a processed event.
		 */
		readonly processEvent: <A, E, R>(
			event: { id: string; type: string },
			apply: (tx: BillingTx) => Effect.Effect<A, E, R>
		) => Effect.Effect<{ _tag: 'processed'; value: A } | { _tag: 'duplicate' }, E | DatabaseError, R>;
	}
>()('ttg/db/Billing') {
	static readonly layer = Layer.effect(
		Billing,
		Effect.gen(function* () {
			const db = yield* Db;
			const latestSub = (q: Queryer, userId: string) =>
				q
					.maybeOne<SubDbRow>(
						`select stripe_subscription_id, price_id, status, current_period_end, past_due_since, cancel_at_period_end from subscriptions
						 where user_id = $1
						 order by (status in ('active', 'trialing', 'past_due')) desc, created_at desc limit 1`,
						[userId]
					)
					.pipe(Effect.map((r) => (r ? toSub(r) : null)));
			const assessmentPaid = (q: Queryer, userId: string) =>
				q
					.maybeOne(`select 1 as ok from payments where user_id = $1 and kind = 'assessment' and status = 'paid'`, [userId])
					.pipe(Effect.map((r) => r !== undefined));
			return Billing.of({
				customerId: (userId) =>
					db.maybeOne<{ stripe_customer_id: string }>(`select stripe_customer_id from stripe_customers where user_id = $1`, [userId]).pipe(Effect.map((r) => r?.stripe_customer_id)),
				saveCustomer: (userId, customerId) =>
					db
						.maybeOne<{ stripe_customer_id: string }>(
							`with ins as (insert into stripe_customers (user_id, stripe_customer_id) values ($1, $2) on conflict (user_id) do nothing returning stripe_customer_id)
							 select stripe_customer_id from ins union all select stripe_customer_id from stripe_customers where user_id = $1 limit 1`,
							[userId, customerId]
						)
						.pipe(Effect.map((r) => r!.stripe_customer_id)),
				entitlements: (userId, now = new Date()) =>
					Effect.gen(function* () {
						const [sub, paid] = yield* Effect.all([latestSub(db, userId), assessmentPaid(db, userId)]);
						const subscription: SubscriptionFacts | null = sub
							? { status: sub.status, currentPeriodEnd: sub.currentPeriodEnd, pastDueSince: sub.pastDueSince, cancelAtPeriodEnd: sub.cancelAtPeriodEnd }
							: null;
						return entitlementsFor({ assessmentPaid: paid, subscription, now });
					}),
				details: (userId) =>
					Effect.gen(function* () {
						const [subscription, paid, customer, payments] = yield* Effect.all([
							latestSub(db, userId),
							assessmentPaid(db, userId),
							db.maybeOne(`select 1 as ok from stripe_customers where user_id = $1`, [userId]),
							db.query<{ id: string; kind: 'assessment' | 'membership'; amount_cents: number; currency: string; status: string; paid_at: Date | null }>(
								`select id, kind, amount_cents, currency, status, paid_at from payments where user_id = $1 order by coalesce(paid_at, created_at) desc limit 50`,
								[userId]
							)
						]);
						return {
							subscription,
							assessmentPaid: paid,
							hasCustomer: customer !== undefined,
							payments: payments.map((p) => ({ id: p.id, kind: p.kind, amountCents: p.amount_cents, currency: p.currency.trim(), status: p.status, paidAt: p.paid_at }))
						};
					}),
				processEvent: (event, apply) =>
					db.transaction((tx) =>
						Effect.gen(function* () {
							// The upsert takes the row lock, so a concurrent delivery of the same event waits here.
							const claimed = yield* tx.maybeOne<{ done: boolean }>(
								`insert into stripe_events (event_id, type) values ($1, $2)
								 on conflict (event_id) do update set type = excluded.type returning (processed_at is not null) as done`,
								[event.id, event.type]
							);
							if (claimed?.done) return { _tag: 'duplicate' } as const;
							const value = yield* apply(makeTx(tx));
							yield* tx.query(`update stripe_events set processed_at = now() where event_id = $1`, [event.id]);
							return { _tag: 'processed', value } as const;
						})
					)
			});
		})
	);
}
