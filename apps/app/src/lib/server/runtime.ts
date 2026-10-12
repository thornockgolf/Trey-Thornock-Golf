import { COACH_CLERK_USER_IDS, DATABASE_URL } from '$app/env/private';
import { Db, Users } from '@ttg/db';
import { Layer, ManagedRuntime } from 'effect';
import { CoachAllowlist } from './auth';
import { makeRunRoute } from './run-route';

/**
 * Live services for the app server. Add each external dependency (Db, Clerk, R2, Queue, ...) as a
 * `Context.Service` with a `layer` and merge it here.
 */
export const AppLayer = Layer.mergeAll(
	CoachAllowlist.layerFromCsv(COACH_CLERK_USER_IDS),
	Users.layer.pipe(Layer.provide(Db.layerFromUrl(DATABASE_URL)))
);

// One shared memo map so layers build once across requests (and across dev HMR reloads).
const memoMap = Layer.makeMemoMapUnsafe();
export const appRuntime = ManagedRuntime.make(AppLayer, { memoMap });

/** Run a route's Effect and turn it into a Response. Use in every `+server.ts` handler. */
export const runRoute = makeRunRoute(appRuntime);
