import { Context, Effect, Layer } from 'effect';
import pg from 'pg';
import { APP_SCHEMA } from './migrate';
import { DatabaseError } from './errors';

/** Run SQL. `T` is the row shape you expect; it is not validated here. */
export interface Queryer {
	/** All rows. */
	readonly query: <T extends pg.QueryResultRow = pg.QueryResultRow>(
		text: string,
		params?: readonly unknown[]
	) => Effect.Effect<readonly T[], DatabaseError>;
	/** The first row, or undefined. */
	readonly maybeOne: <T extends pg.QueryResultRow = pg.QueryResultRow>(
		text: string,
		params?: readonly unknown[]
	) => Effect.Effect<T | undefined, DatabaseError>;
}

export interface DbService extends Queryer {
	/**
	 * Run `f` in one transaction on one connection: commit if it succeeds, roll back if it fails or
	 * defects. Use the `Queryer` passed to `f`, not `Db`, for statements that belong to it.
	 */
	readonly transaction: <A, E, R>(
		f: (tx: Queryer) => Effect.Effect<A, E, R>
	) => Effect.Effect<A, E | DatabaseError, R>;
}

const wrap = (message: string) => (cause: unknown) => new DatabaseError({ message, cause });

const makeQueryer = (run: pg.Pool | pg.PoolClient): Queryer => {
	const query = <T extends pg.QueryResultRow = pg.QueryResultRow>(text: string, params: readonly unknown[] = []) =>
		Effect.tryPromise({
			try: async () => (await run.query<T>(text, params as unknown[])).rows as readonly T[],
			catch: wrap('Query failed')
		});
	return {
		query,
		maybeOne: (text, params) => query(text, params).pipe(Effect.map((rows) => rows[0]))
	} as Queryer;
};

/** Postgres access for the app and the worker. Tables live in the `app` schema (search_path is set). */
export class Db extends Context.Service<Db, DbService>()('ttg/db/Db') {
	/** Pooled connection from a URL; the pool closes when the layer's scope closes. */
	static layerFromUrl = (connectionString: string, options: { max?: number } = {}) =>
		Layer.effect(
			Db,
			Effect.gen(function* () {
				const pool = yield* Effect.acquireRelease(
					Effect.sync(
						() =>
							new pg.Pool({
								connectionString,
								max: options.max ?? 10,
								options: `-c search_path=${APP_SCHEMA},public`
							})
					),
					(p) => Effect.promise(() => p.end())
				);
				// A broken idle connection must not crash the process.
				pool.on('error', (e) => console.error('Postgres pool error:', e.message));
				const base = makeQueryer(pool);
				const transaction = <A, E, R>(f: (tx: Queryer) => Effect.Effect<A, E, R>) =>
					Effect.acquireUseRelease(
						Effect.tryPromise({ try: () => pool.connect(), catch: wrap('Could not get a database connection') }),
						(client) =>
							Effect.gen(function* () {
								yield* Effect.tryPromise({ try: () => client.query('begin'), catch: wrap('Could not begin transaction') });
								return yield* f(makeQueryer(client));
							}).pipe(
								Effect.tapCause((cause) => Effect.promise(() => client.query('rollback').catch(() => undefined)).pipe(Effect.as(cause))),
								Effect.tap(() => Effect.tryPromise({ try: () => client.query('commit'), catch: wrap('Could not commit transaction') }))
							),
						(client) => Effect.sync(() => client.release())
					);
				return Db.of({ ...base, transaction });
			})
		);
}
