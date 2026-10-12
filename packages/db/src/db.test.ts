import { assert, describe, it, layer } from '@effect/vitest';
import { Effect, Exit } from 'effect';
import { Db } from './db';
import { DatabaseError } from './errors';
import { TestDb } from './testing';

class Boom {
	readonly _tag = 'Boom';
}

layer(TestDb, { timeout: 60_000 })('Db', (it) => {
	it.effect('resolves unqualified table names through the app schema', () =>
		Effect.gen(function* () {
			const db = yield* Db;
			const rows = yield* db.query<{ n: string }>('select count(*)::text as n from users');
			assert.strictEqual(rows[0]?.n, '0');
		}));

	it.effect('maybeOne returns undefined for no rows', () =>
		Effect.gen(function* () {
			const db = yield* Db;
			assert.isUndefined(yield* db.maybeOne('select 1 from users where clerk_user_id = $1', ['nobody']));
		}));

	it.effect('fails with DatabaseError and a generic message, keeping the cause for logs', () =>
		Effect.gen(function* () {
			const db = yield* Db;
			const exit = yield* Effect.exit(db.query('select * from table_that_does_not_exist'));
			assert.isTrue(Exit.isFailure(exit));
			const err = yield* db.query('select * from table_that_does_not_exist').pipe(Effect.flip);
			assert.instanceOf(err, DatabaseError);
			assert.strictEqual(err.message, 'Query failed');
			assert.isDefined(err.cause);
		}));

	it.effect('commits a transaction on success', () =>
		Effect.gen(function* () {
			const db = yield* Db;
			yield* db.transaction((tx) => tx.query(`insert into users (clerk_user_id) values ('tx_ok')`));
			assert.isDefined(yield* db.maybeOne(`select 1 from users where clerk_user_id = 'tx_ok'`));
		}));

	it.effect('rolls back on a typed failure', () =>
		Effect.gen(function* () {
			const db = yield* Db;
			const result = yield* db
				.transaction((tx) =>
					Effect.gen(function* () {
						yield* tx.query(`insert into users (clerk_user_id) values ('tx_fail')`);
						return yield* Effect.fail(new Boom());
					})
				)
				.pipe(Effect.flip);
			assert.instanceOf(result, Boom);
			assert.isUndefined(yield* db.maybeOne(`select 1 from users where clerk_user_id = 'tx_fail'`));
		}));

	it.effect('rolls back on a defect', () =>
		Effect.gen(function* () {
			const db = yield* Db;
			yield* db
				.transaction((tx) =>
					Effect.gen(function* () {
						yield* tx.query(`insert into users (clerk_user_id) values ('tx_die')`);
						return yield* Effect.die('kaboom');
					})
				)
				.pipe(Effect.exit);
			assert.isUndefined(yield* db.maybeOne(`select 1 from users where clerk_user_id = 'tx_die'`));
		}));

	it.effect('rolls back when a statement inside the transaction fails', () =>
		Effect.gen(function* () {
			const db = yield* Db;
			const err = yield* db
				.transaction((tx) =>
					Effect.gen(function* () {
						yield* tx.query(`insert into users (clerk_user_id) values ('tx_sql')`);
						yield* tx.query(`insert into users (clerk_user_id, role) values ('tx_sql2', 'admin')`);
					})
				)
				.pipe(Effect.flip);
			assert.instanceOf(err, DatabaseError);
			assert.isUndefined(yield* db.maybeOne(`select 1 from users where clerk_user_id = 'tx_sql'`));
		}));

	it.effect('releases connections: more transactions than the pool size still finish', () =>
		Effect.gen(function* () {
			const db = yield* Db;
			// pool max is 4; 20 sequential failing and succeeding transactions must not leak
			for (let i = 0; i < 20; i++) {
				yield* db.transaction((tx) => tx.query('select 1')).pipe(Effect.exit);
				yield* db.transaction(() => Effect.fail(new Boom())).pipe(Effect.exit);
			}
			const rows = yield* db.query('select 1 as ok');
			assert.strictEqual(rows.length, 1);
		}));
});
