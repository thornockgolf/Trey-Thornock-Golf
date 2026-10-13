import { assert, layer } from '@effect/vitest';
import { Effect, Layer } from 'effect';
import { Billing, type BillingTx, type SubscriptionWrite } from './billing';
import { Chat } from './chat';
import { Coaching } from './coaching';
import { Db } from './db';
import { TestDb } from './testing';
import { Users } from './users';

const Live = Layer.mergeAll(Users.layer, Coaching.layer, Chat.layer, Billing.layer).pipe(Layer.provideMerge(TestDb));
const sub = (userId: string, over: Partial<SubscriptionWrite> = {}): SubscriptionWrite => ({
	userId,
	stripeSubscriptionId: 'sub_1',
	stripeCustomerId: 'cus_1',
	priceId: 'price_m',
	status: 'active',
	currentPeriodEnd: new Date('2030-01-01'),
	cancelAtPeriodEnd: false,
	eventCreatedAt: new Date('2026-10-01T00:00:00Z'),
	...over
});

layer(Live, { timeout: 60_000 })('Billing', (it) => {
	const mk = (tag: string) =>
		Effect.gen(function* () {
			const users = yield* Users;
			return { player: yield* users.ensure({ clerkUserId: `${tag}_p`, role: 'player' }), billing: yield* Billing, db: yield* Db, users };
		});

	it.effect('keeps one Stripe customer per user, even when two requests race', () =>
		Effect.gen(function* () {
			const { player, billing } = yield* mk('b1');
			assert.isUndefined(yield* billing.customerId(player.id));
			assert.strictEqual(yield* billing.saveCustomer(player.id, 'cus_a'), 'cus_a');
			assert.strictEqual(yield* billing.saveCustomer(player.id, 'cus_b'), 'cus_a');
			assert.strictEqual(yield* billing.customerId(player.id), 'cus_a');
		})
	);

	it.effect('handles an event once: a repeat is ignored and does not call apply', () =>
		Effect.gen(function* () {
			const { player, billing } = yield* mk('b2');
			let calls = 0;
			const apply = (tx: BillingTx) =>
				Effect.sync(() => calls++).pipe(Effect.andThen(tx.upsertSubscription(sub(player.id, { stripeSubscriptionId: 'sub_b2' }))));
			assert.strictEqual((yield* billing.processEvent({ id: 'evt_b2', type: 'x' }, apply))._tag, 'processed');
			assert.strictEqual((yield* billing.processEvent({ id: 'evt_b2', type: 'x' }, apply))._tag, 'duplicate');
			assert.strictEqual(calls, 1);
		})
	);

	it.effect('two concurrent deliveries of the same event apply once', () =>
		Effect.gen(function* () {
			const { player, billing } = yield* mk('b3');
			let calls = 0;
			const apply = (tx: BillingTx) =>
				Effect.sync(() => calls++).pipe(
					Effect.andThen(Effect.promise(() => new Promise((r) => setTimeout(r, 100)))),
					Effect.andThen(tx.recordPayment({ userId: player.id, kind: 'assessment', stripePaymentIntentId: 'pi_b3', amountCents: 14900, currency: 'usd', status: 'paid', paidAt: new Date() }))
				);
			const results = yield* Effect.all([billing.processEvent({ id: 'evt_b3', type: 'x' }, apply), billing.processEvent({ id: 'evt_b3', type: 'x' }, apply)], { concurrency: 2 });
			assert.deepStrictEqual(results.map((r) => r._tag).sort(), ['duplicate', 'processed']);
			assert.strictEqual(calls, 1);
		})
	);

	it.effect('a failed apply rolls back the event so the retry runs it again', () =>
		Effect.gen(function* () {
			const { player, billing, db } = yield* mk('b4');
			const failing = yield* Effect.exit(
				billing.processEvent({ id: 'evt_b4', type: 'x' }, (tx) =>
					tx.recordPayment({ userId: player.id, kind: 'assessment', stripePaymentIntentId: 'pi_b4', amountCents: 1, currency: 'usd', status: 'paid', paidAt: null }).pipe(Effect.andThen(Effect.die('boom')))
				)
			);
			assert.isTrue(failing._tag === 'Failure');
			assert.strictEqual((yield* db.query(`select 1 from stripe_events where event_id = 'evt_b4'`)).length, 0);
			assert.strictEqual((yield* db.query(`select 1 from payments where user_id = $1`, [player.id])).length, 0);
			assert.strictEqual((yield* billing.processEvent({ id: 'evt_b4', type: 'x' }, () => Effect.succeed(1)))._tag, 'processed');
		})
	);

	it.effect('computes entitlements: assessment, membership, past_due grace, cancelled-but-paid', () =>
		Effect.gen(function* () {
			const { player, billing } = yield* mk('b5');
			const e0 = yield* billing.entitlements(player.id);
			assert.deepStrictEqual([e0.assessment, e0.membership], [false, false]);
			yield* billing.processEvent({ id: 'evt_b5a', type: 'x' }, (tx) =>
				tx.recordPayment({ userId: player.id, kind: 'assessment', stripePaymentIntentId: 'pi_b5', amountCents: 14900, currency: 'usd', status: 'paid', paidAt: new Date() })
			);
			const e1 = yield* billing.entitlements(player.id);
			assert.deepStrictEqual([e1.assessment, e1.membership], [true, false]);
			yield* billing.processEvent({ id: 'evt_b5b', type: 'x' }, (tx) => tx.upsertSubscription(sub(player.id, { stripeSubscriptionId: 'sub_b5' })));
			assert.isTrue((yield* billing.entitlements(player.id)).membership);
			yield* billing.processEvent({ id: 'evt_b5c', type: 'x' }, (tx) =>
				tx.upsertSubscription(sub(player.id, { stripeSubscriptionId: 'sub_b5', status: 'past_due', eventCreatedAt: new Date('2026-10-02T00:00:00Z') }))
			);
			const due = yield* billing.entitlements(player.id);
			assert.isTrue(due.pastDue);
			assert.isTrue(due.membership); // inside the grace period
			const later = yield* billing.entitlements(player.id, new Date(Date.now() + 8 * 86_400_000));
			assert.isFalse(later.membership); // grace over
		})
	);

	it.effect('ignores an older subscription event that arrives late', () =>
		Effect.gen(function* () {
			const { player, billing } = yield* mk('b6');
			yield* billing.processEvent({ id: 'evt_b6a', type: 'x' }, (tx) =>
				tx.upsertSubscription(sub(player.id, { stripeSubscriptionId: 'sub_b6', status: 'canceled', currentPeriodEnd: new Date('2020-01-01'), eventCreatedAt: new Date('2026-10-05T00:00:00Z') }))
			);
			const applied = yield* billing.processEvent({ id: 'evt_b6b', type: 'x' }, (tx) =>
				tx.upsertSubscription(sub(player.id, { stripeSubscriptionId: 'sub_b6', status: 'active', eventCreatedAt: new Date('2026-10-04T00:00:00Z') }))
			);
			assert.deepStrictEqual(applied._tag === 'processed' && applied.value, false);
			assert.strictEqual((yield* billing.details(player.id)).subscription?.status, 'canceled');
		})
	);

	it.effect('pairs a paying player with the first coach once, and gives them a conversation', () =>
		Effect.gen(function* () {
			const { player, billing, db, users } = yield* mk('b7');
			assert.isUndefined(yield* billing.processEvent({ id: 'evt_b7a', type: 'x' }, (tx) => tx.pairWithCoach(player.id)).pipe(Effect.map((r) => (r._tag === 'processed' ? r.value : 1))));
			// a coach exists now
			const coach = yield* users.ensure({ clerkUserId: 'b7_c', role: 'coach' });
			const first = yield* billing.processEvent({ id: 'evt_b7b', type: 'x' }, (tx) => tx.pairWithCoach(player.id));
			assert.strictEqual(first._tag === 'processed' && first.value?.coachId !== undefined, true);
			const again = yield* billing.processEvent({ id: 'evt_b7c', type: 'x' }, (tx) => tx.pairWithCoach(player.id));
			assert.strictEqual(again._tag === 'processed' && again.value, undefined);
			assert.strictEqual((yield* db.query(`select 1 from coach_assignments where player_id = $1 and status = 'active'`, [player.id])).length, 1);
			assert.strictEqual((yield* db.query(`select 1 from conversations where player_id = $1`, [player.id])).length, 1);
			void coach;
		})
	);
});
