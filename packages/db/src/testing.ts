import { Effect, Layer } from 'effect';
import { Db } from './db';
import { migrate } from './migrate';
import { createTempDatabase } from './test-db';

/**
 * A Db layer on a fresh, fully migrated throwaway database on the local Postgres
 * (`docker compose up -d db`). The database is dropped when the layer's scope closes.
 */
export const TestDb = Layer.unwrap(
	Effect.gen(function* () {
		const tmp = yield* Effect.acquireRelease(
			Effect.promise(createTempDatabase),
			(t) => Effect.promise(() => t.drop())
		);
		yield* Effect.promise(() => migrate(tmp.url));
		return Db.layerFromUrl(tmp.url, { max: 4 });
	})
);
