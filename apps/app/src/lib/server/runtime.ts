import {
	COACH_CLERK_USER_IDS,
	DATABASE_URL,
	R2_ACCESS_KEY_ID,
	R2_BUCKET,
	R2_ENDPOINT,
	R2_SECRET_ACCESS_KEY
} from '$app/env/private';
import { Analyses, Annotations, Assessments, CheckIns, Coaching, Profiles, Db, Drills, Plans, Questionnaires, Queue, Segments, Users, Videos } from '@ttg/db';
import { Layer, ManagedRuntime } from 'effect';
import { CoachAllowlist } from './auth';
import { R2 } from './r2';
import { makeRunLoad, makeRunRoute } from './run-route';

/**
 * Live services for the app server. Add each external dependency (Db, Clerk, R2, Queue, ...) as a
 * `Context.Service` with a `layer` and merge it here.
 */
const DbLive = Db.layerFromUrl(DATABASE_URL);

export const AppLayer = Layer.mergeAll(
	CoachAllowlist.layerFromCsv(COACH_CLERK_USER_IDS),
	Users.layer.pipe(Layer.provide(DbLive)),
	Videos.layer.pipe(Layer.provide(DbLive)),
	Annotations.layer.pipe(Layer.provide(DbLive)),
	Questionnaires.layer.pipe(Layer.provide(DbLive)),
	Drills.layer.pipe(Layer.provide(DbLive)),
	Coaching.layer.pipe(Layer.provide(DbLive)),
	Profiles.layer.pipe(Layer.provide(DbLive)),
	CheckIns.layer.pipe(Layer.provide(DbLive)),
	Assessments.layer.pipe(Layer.provide(DbLive)),
	Plans.layer.pipe(Layer.provide(DbLive)),
	Analyses.layer.pipe(Layer.provide(DbLive)),
	Segments.layer.pipe(Layer.provide(DbLive)),
	// The app only enqueues jobs (e.g. video.uploaded from /complete); the worker consumes them.
	Queue.layerFromUrl(DATABASE_URL, { role: 'producer' }),
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

/** Run a route's Effect inside a `load` function; failures become `error(status, message)`. */
export const runLoad = makeRunLoad(appRuntime);
