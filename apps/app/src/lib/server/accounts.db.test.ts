import { Accounts, Coaching, Db, Queue, Users, Videos } from '@ttg/db';
import { TestDb } from '@ttg/db/testing';
import { Effect, Layer, ManagedRuntime } from 'effect';
import type Stripe from 'stripe';
import { afterAll, describe, expect, it } from 'vitest';
import { DELETE_AFTER_SECONDS, deletePlayer } from './accounts';
import { CoachAllowlist, currentUser } from './auth';
import { ClerkAdmin } from './clerk-admin';
import { UpstreamError } from './errors';
import { makeRunRoute } from './run-route';
import { StripeApi } from './stripe';
import { fakeEvent } from './test-utils';

// Integration: the coach-triggered deletion on a real database. Stripe, Clerk and the queue are recording stand-ins.
const calls: string[] = [];
let stripeFails = false;
let clerkFails = false;
const client = {
	customers: {
		del: async (id: string) => {
			calls.push(`stripe:${id}`);
			if (stripeFails) throw new Error('stripe down');
			return { id, deleted: true };
		}
	}
} as unknown as Stripe;
const { layer: FakeQueue, sent } = Queue.layerMemory();
const FakeClerk = ClerkAdmin.layerFromClient({
	users: {
		deleteUser: async (id: string) => {
			calls.push(`clerk:${id}`);
			if (clerkFails) throw new Error('clerk down');
		}
	}
});

const Services = Layer.mergeAll(Users.layer, Videos.layer, Coaching.layer, Accounts.layer).pipe(Layer.provideMerge(TestDb));
const rt = ManagedRuntime.make(
	Layer.mergeAll(
		CoachAllowlist.layerFromCsv('coach_a'),
		StripeApi.layerFromConfig({ secretKey: 'sk_test_x', webhookSecret: 'whsec', assessmentPriceId: 'a', membershipPriceId: 'm', client }),
		FakeClerk,
		FakeQueue
	).pipe(Layer.provideMerge(Services))
);
const run = makeRunRoute(rt);
afterAll(() => rt.dispose());

const del = async (clerkUser: string | null, playerId: string, body: unknown = { confirm: true }) => {
	const res = await run(fakeEvent({ userId: clerkUser, body, params: { id: playerId } }), deletePlayer as never);
	return { status: res.status, body: (await res.json()) as any };
};
const user = (clerk: string, role: 'player' | 'coach' = 'player') => rt.runPromise(Effect.flatMap(Users, (u) => u.ensure({ clerkUserId: clerk, role })));
const reset = () => ((calls.length = 0), (sent.length = 0), (stripeFails = false), (clerkFails = false));

describe('POST /api/players/:id/delete', () => {
	it('only a coach may delete, only a player can be deleted, and the body must confirm', async () => {
		reset();
		const coach = await user('coach_a', 'coach');
		const p = await user('p_perm');
		await user('p_other');
		expect((await del(null, p.id)).status).toBe(401);
		expect((await del('p_other', p.id)).status).toBe(403);
		expect((await del('coach_a', p.id, {})).status).toBe(422);
		expect((await del('coach_a', p.id, { confirm: false })).status).toBe(422);
		expect((await del('coach_a', 'nope')).status).toBe(404);
		expect((await del('coach_a', coach.id)).status).toBe(404); // a coach is not a player
		expect(calls).toEqual([]);
		expect(sent).toEqual([]);
		expect((await rt.runPromise(Effect.flatMap(Users, (u) => u.findById(p.id))))!.locked).toBe(false);
	});

	it('closes billing and sign-in, locks the account and queues the job after the upload window', async () => {
		reset();
		const p = await user('p_full');
		await rt.runPromise(Effect.flatMap(Effect.service(Db), (db) => db.query(`insert into stripe_customers (user_id, stripe_customer_id) values ($1, 'cus_full')`, [p.id])));
		const res = await del('coach_a', p.id);
		expect(res).toEqual({ status: 200, body: { ok: true } });
		expect(calls).toEqual(['stripe:cus_full', 'clerk:p_full']);
		expect(sent).toEqual([{ name: 'account.delete', payload: { user_id: p.id }, options: { startAfterSeconds: DELETE_AFTER_SECONDS } }]);
		expect(DELETE_AFTER_SECONDS).toBeGreaterThan(15 * 60);
		// the locked account cannot use the app even with a still-valid session
		const exit = await run(fakeEvent({ userId: 'p_full' }), currentUser as never);
		expect(exit.status).toBe(403);
	});

	it('a player without a Stripe customer skips Stripe', async () => {
		reset();
		const p = await user('p_nostripe');
		expect((await del('coach_a', p.id)).status).toBe(200);
		expect(calls).toEqual(['clerk:p_nostripe']);
		expect(sent).toHaveLength(1);
	});

	it('a Stripe or Clerk failure queues nothing, answers 502 and can be retried', async () => {
		reset();
		const p = await user('p_retry');
		await rt.runPromise(Effect.flatMap(Effect.service(Db), (db) => db.query(`insert into stripe_customers (user_id, stripe_customer_id) values ($1, 'cus_retry')`, [p.id])));
		stripeFails = true;
		const a = await del('coach_a', p.id);
		expect(a.status).toBe(502);
		expect(a.body.code).toBe('UpstreamError');
		expect(a.body.message).toContain('Nothing was deleted');
		stripeFails = false;
		clerkFails = true;
		expect((await del('coach_a', p.id)).status).toBe(502);
		expect(sent).toEqual([]);
		clerkFails = false;
		expect((await del('coach_a', p.id)).status).toBe(200);
		expect(sent).toHaveLength(1);
	});

	it('asking again after the account is erased is a no-op', async () => {
		reset();
		const p = await user('p_done');
		await del('coach_a', p.id);
		await rt.runPromise(Effect.flatMap(Accounts, (a) => a.erase(p.id)));
		reset();
		expect((await del('coach_a', p.id)).status).toBe(200);
		expect(calls).toEqual([]);
		expect(sent).toEqual([]);
	});
});

describe('UpstreamError', () => {
	it('is a 502 with the message but not the cause', async () => {
		const res = await makeRunRoute(rt)(fakeEvent({ userId: 'coach_a' }), Effect.fail(new UpstreamError({ message: 'Clerk is down', cause: new Error('secret detail') })) as never);
		expect(res.status).toBe(502);
		expect(JSON.stringify(await res.json())).not.toContain('secret detail');
	});
});
