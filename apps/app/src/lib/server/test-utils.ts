import type { RequestEvent } from '@sveltejs/kit';
import type { Role } from '@ttg/shared';
import { Billing, Users, type User } from '@ttg/db';
import { Effect, Layer, ManagedRuntime } from 'effect';
import { CoachAllowlist } from './auth';
import { makeRunLoad, makeRunRoute } from './run-route';

/** A minimal RequestEvent: only what handlers read in tests. */
export const fakeEvent = (
	opts: { userId?: string | null; body?: unknown; rawBody?: string; params?: Record<string, string>; query?: string; headers?: Record<string, string> } = {}
) =>
	({
		request: new Request('http://localhost/api/test', {
			method: 'POST',
			headers: opts.headers ?? {},
			body: opts.rawBody ?? (opts.body === undefined ? undefined : JSON.stringify(opts.body))
		}),
		locals: { auth: () => ({ userId: opts.userId ?? null }) },
		params: opts.params ?? {},
		url: new URL(`http://localhost/api/test${opts.query ?? ''}`)
	}) as unknown as RequestEvent;

/** In-memory Users: ids are stable per clerk id, roles follow what `ensure` is given. */
export const FakeUsers = Layer.sync(Users, () => {
	const rows = new Map<string, User>();
	return Users.of({
		ensure: ({ clerkUserId, role }: { clerkUserId: string; role: Role }) =>
			Effect.sync(() => {
				const u: User = { id: `id_${clerkUserId}`, clerkUserId, role, displayName: null, email: null, locked: false };
				rows.set(clerkUserId, u);
				return u;
			}),
		findByClerkId: (id: string) => Effect.sync(() => rows.get(id)),
		findById: (id: string) => Effect.sync(() => [...rows.values()].find((u) => u.id === id)),
		setDisplayName: (id: string, name: string | null) =>
			Effect.sync(() => {
				const u = [...rows.values()].find((x) => x.id === id);
				if (!u) return undefined;
				const next = { ...u, displayName: name };
				rows.set(u.clerkUserId, next);
				return next;
			})
	});
});

export const testRunRoute = (coachIds = 'coach_1', users: Layer.Layer<Users> = FakeUsers) =>
	makeRunRoute(ManagedRuntime.make(Layer.mergeAll(CoachAllowlist.layerFromCsv(coachIds), users)));

export const testRunLoad = (coachIds = 'coach_1', users: Layer.Layer<Users> = FakeUsers) =>
	makeRunLoad(ManagedRuntime.make(Layer.mergeAll(CoachAllowlist.layerFromCsv(coachIds), users)));

/** Give a player the assessment and an active membership, the way the webhook would. For suites about other features. */
export const grantAccess = (userId: string, level: 'assessment' | 'membership' = 'membership') =>
	Effect.gen(function* () {
		const billing = yield* Billing;
		yield* billing.processEvent({ id: `grant_${level}_${userId}`, type: 'test.grant' }, (tx) =>
			Effect.gen(function* () {
				yield* tx.recordPayment({ userId, kind: 'assessment', stripePaymentIntentId: `pi_test_${userId}`, amountCents: 14900, currency: 'usd', status: 'paid', paidAt: new Date() });
				if (level === 'membership')
					yield* tx.upsertSubscription({
						userId,
						stripeSubscriptionId: `sub_test_${userId}`,
						stripeCustomerId: `cus_test_${userId}`,
						priceId: 'price_test',
						status: 'active',
						currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000),
						cancelAtPeriodEnd: false,
						eventCreatedAt: new Date()
					});
			})
		);
	});

/**
 * Before each call of a suite that is not about payments, make every player it touches a paying
 * one (once each). Coaches are skipped by clerk id.
 */
export const autoPay = <R extends Users | Billing>(rt: ManagedRuntime.ManagedRuntime<R, unknown>, coachClerkIds: readonly string[] = []) => {
	const done = new Set<string>();
	return async (clerkUserId: string | null) => {
		if (!clerkUserId || done.has(clerkUserId) || coachClerkIds.includes(clerkUserId)) return;
		done.add(clerkUserId);
		await rt.runPromise(
			Effect.gen(function* () {
				const users = yield* Users;
				const existing = yield* users.findByClerkId(clerkUserId);
				const user = existing ?? (yield* users.ensure({ clerkUserId, role: 'player' }));
				if (user.role === 'player') yield* grantAccess(user.id);
			}) as Effect.Effect<void, unknown, R>
		);
	};
};
