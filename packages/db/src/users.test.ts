import { assert, layer } from '@effect/vitest';
import { Effect, Layer } from 'effect';
import { Db } from './db';
import { TestDb } from './testing';
import { Users } from './users';

const Live = Users.layer.pipe(Layer.provideMerge(TestDb));

layer(Live, { timeout: 60_000 })('Users', (it) => {
	it.effect('creates a player on first sight', () =>
		Effect.gen(function* () {
			const users = yield* Users;
			const u = yield* users.ensure({ clerkUserId: 'user_new', role: 'player' });
			assert.strictEqual(u.clerkUserId, 'user_new');
			assert.strictEqual(u.role, 'player');
			assert.match(u.id, /^[0-9a-f-]{36}$/);
		}));

	it.effect('is idempotent: the same id comes back', () =>
		Effect.gen(function* () {
			const users = yield* Users;
			const a = yield* users.ensure({ clerkUserId: 'user_same', role: 'player' });
			const b = yield* users.ensure({ clerkUserId: 'user_same', role: 'player' });
			assert.strictEqual(a.id, b.id);
			const db = yield* Db;
			const rows = yield* db.query(`select 1 from users where clerk_user_id = 'user_same'`);
			assert.strictEqual(rows.length, 1);
		}));

	it.effect('updates the role when the allowlist changes, keeping the id', () =>
		Effect.gen(function* () {
			const users = yield* Users;
			const a = yield* users.ensure({ clerkUserId: 'user_promo', role: 'player' });
			const b = yield* users.ensure({ clerkUserId: 'user_promo', role: 'coach' });
			assert.strictEqual(b.id, a.id);
			assert.strictEqual(b.role, 'coach');
			const c = yield* users.ensure({ clerkUserId: 'user_promo', role: 'player' });
			assert.strictEqual(c.role, 'player');
		}));

	it.effect('survives concurrent first sign-ins without duplicates', () =>
		Effect.gen(function* () {
			const users = yield* Users;
			const results = yield* Effect.all(
				Array.from({ length: 8 }, () => users.ensure({ clerkUserId: 'user_race', role: 'player' })),
				{ concurrency: 8 }
			);
			assert.strictEqual(new Set(results.map((r) => r.id)).size, 1);
		}));

	it.effect('findByClerkId returns undefined for an unknown user', () =>
		Effect.gen(function* () {
			const users = yield* Users;
			assert.isUndefined(yield* users.findByClerkId('user_unknown'));
		}));
});
