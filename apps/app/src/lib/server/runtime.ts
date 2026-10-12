import {
	COACH_CLERK_USER_IDS,
	DATABASE_URL,
	R2_ACCESS_KEY_ID,
	R2_BUCKET,
	R2_ENDPOINT,
	R2_SECRET_ACCESS_KEY
} from '$app/env/private';
import { Db, Users } from '@ttg/db';
import { Layer, ManagedRuntime } from 'effect';
import { CoachAllowlist } from './auth';
import { R2 } from './r2';
import { makeRunRoute } from './run-route';

/**
 * Live services for the app server. Add each external dependency (Db, Clerk, R2, Queue, ...) as a
 * `Context.Service` with a `layer` and merge it here.
 */
export const AppLayer = Layer.mergeAll(
	CoachAllowlist.layerFromCsv(COACH_CLERK_USER_IDS),
	Users.layer.pipe(Layer.provide(Db.layerFromUrl(DATABASE_URL))),
	R2.layerFromConfig({
		endpoint: R2_ENDPOINT,
		accessKeyId: R2_ACCESS_KEY_ID,
		secretAccessKey: R2_SECRET_ACCESS_KEY,
		bucket: R2_BUCKET
	})
);

// One shared memo map so layers build once across requests (and across dev HMR reloads).
const memoMap = Layer.makeMemoMapUnsafe();
export const appRuntime = ManagedRuntime.make(AppLayer, { memoMap });

/** Run a route's Effect and turn it into a Response. Use in every `+server.ts` handler. */
export const runRoute = makeRunRoute(appRuntime);
