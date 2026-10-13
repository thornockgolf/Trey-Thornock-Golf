import { Db, Users } from '@ttg/db';
import { TestDb } from '@ttg/db/testing';
import { Effect, Layer, ManagedRuntime } from 'effect';
import { describe, expect, it, vi } from 'vitest';
import { CoachAllowlist, currentUser } from './auth';
import { ClerkAdmin, type ClerkUserRecord } from './clerk-admin';
import { makeRunRoute } from './run-route';
import { fakeEvent } from './test-utils';

// Integration: real Users + Db on a throwaway migrated database (needs `docker compose up -d db`), a fake Clerk client.
const calls: string[] = [];
let clerkUser: ClerkUserRecord | 'fail' | 'hang' = { firstName: null, lastName: null, primaryEmailAddressId: null, emailAddresses: [] };
const FakeClerk = ClerkAdmin.layerFromClient({
	users: {
		deleteUser: async () => undefined,
		getUser: async (id: string) => {
			calls.push(id);
			if (clerkUser === 'fail') throw new Error('clerk is down');
			if (clerkUser === 'hang') return new Promise<ClerkUserRecord>(() => {});
			return clerkUser;
		}
	}
});
const Services = Users.layer.pipe(Layer.provideMerge(TestDb));
const rt = ManagedRuntime.make(Layer.mergeAll(CoachAllowlist.layerFromCsv('coach_x'), FakeClerk).pipe(Layer.provideMerge(Services)));
const run = makeRunRoute(rt);
const as = (userId: string) => run(fakeEvent({ userId }), currentUser);
const row = (clerkUserId: string) =>
	rt.runPromise(
		Effect.gen(function* () {
			const u = yield* (yield* Users).findByClerkId(clerkUserId);
			return u!;
		})
	);
const ageSync = (clerkUserId: string) =>
	rt.runPromise(
		Effect.gen(function* () {
			yield* (yield* Db).query(`update users set profile_synced_at = now() - interval '2 days' where clerk_user_id = $1`, [clerkUserId]);
		})
	);
const jo = (over: Partial<ClerkUserRecord> = {}): ClerkUserRecord => ({
	firstName: 'Jo',
	lastName: 'Golfer',
	primaryEmailAddressId: 'e2',
	emailAddresses: [
		{ id: 'e1', emailAddress: 'old@example.com' },
		{ id: 'e2', emailAddress: 'jo@example.com' }
	],
	...over
});

describe('Clerk name and email sync', () => {
	it('fills the name and the primary email on first sign-in, then leaves Clerk alone', async () => {
		clerkUser = jo();
		calls.length = 0;
		await as('user_sync_1');
		const u = await row('user_sync_1');
		expect([u.displayName, u.email, u.profileStale]).toEqual(['Jo Golfer', 'jo@example.com', false]);
		await as('user_sync_1');
		expect(calls).toEqual(['user_sync_1']);
	});

	it('picks up a changed name or email once the last sync is a day old', async () => {
		clerkUser = jo();
		await as('user_sync_2');
		clerkUser = jo({ firstName: 'Joanna', primaryEmailAddressId: 'e1' });
		await ageSync('user_sync_2');
		await as('user_sync_2');
		const u = await row('user_sync_2');
		expect([u.displayName, u.email]).toEqual(['Joanna Golfer', 'old@example.com']);
	});

	it('keeps a name the player chose, and still refreshes the email', async () => {
		clerkUser = jo();
		await as('user_sync_3');
		await rt.runPromise(
			Effect.gen(function* () {
				const users = yield* Users;
				yield* users.setDisplayName((yield* users.findByClerkId('user_sync_3'))!.id, 'Johnny G');
			})
		);
		clerkUser = jo({ firstName: 'Zed', primaryEmailAddressId: 'e1' });
		await ageSync('user_sync_3');
		await as('user_sync_3');
		const u = await row('user_sync_3');
		expect([u.displayName, u.email]).toEqual(['Johnny G', 'old@example.com']);
	});

	it('never blanks a stored value when Clerk has none', async () => {
		clerkUser = jo();
		await as('user_sync_4');
		clerkUser = { firstName: null, lastName: null, primaryEmailAddressId: null, emailAddresses: [] };
		await ageSync('user_sync_4');
		await as('user_sync_4');
		const u = await row('user_sync_4');
		expect([u.displayName, u.email, u.profileStale]).toEqual(['Jo Golfer', 'jo@example.com', false]);
	});

	it('does not block the request when Clerk fails or hangs, and backs off for a minute', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		clerkUser = 'fail';
		calls.length = 0;
		const res = await as('user_sync_5');
		expect(res.status).toBe(200);
		expect((await row('user_sync_5')).displayName).toBeNull();
		await as('user_sync_5');
		expect(calls).toHaveLength(1);
		vi.restoreAllMocks();
	});

	it('serves the request when Clerk hangs', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		clerkUser = 'hang';
		const res = await as('user_sync_6');
		expect(res.status).toBe(200);
		vi.restoreAllMocks();
	}, 10_000);
});
