import { Accounts, AnalysisExports, Analyses, Annotations, Db, PushSubscriptions, Queue, Realtime, Segments, Videos, WebPush } from '@ttg/db';
import { Effect, Fiber, Layer } from 'effect';
import { healthResponse, type Health } from './health';
import { registerHandlers, settingsFromEnv, stalledSweeper } from './handlers';
import { r2ConfigFromEnv, Storage } from './storage';

// Fail fast with the names (never the values) of anything missing.
const DATABASE_URL = process.env.DATABASE_URL;
const r2 = r2ConfigFromEnv(process.env);
const missing = [...(DATABASE_URL ? [] : ['DATABASE_URL']), ...(r2.ok ? [] : r2.missing)];
if (!DATABASE_URL || !r2.ok) {
	console.error(`Missing environment variables: ${missing.join(', ')}`);
	process.exit(1);
}
const settings = settingsFromEnv(process.env);
const PORT = Number(process.env.PORT ?? 8081);

const health: Health = { ready: false };

// Reachable only inside the Docker network (no published port).
const server = Bun.serve({
	port: PORT,
	fetch: (req) => healthResponse(health, req.method, new URL(req.url).pathname)
});

const DbLive = Db.layerFromUrl(DATABASE_URL, { max: 4 });
const PushSubscriptionsLive = PushSubscriptions.layer.pipe(Layer.provide(DbLive));

const program = Effect.gen(function* () {
	const handlers = yield* registerHandlers(settings);
	yield* Effect.forkScoped(stalledSweeper);
	health.ready = true;
	console.log(
		`worker ready: ${handlers.join(', ')} (concurrency ${settings.concurrency}, ffmpeg threads ${settings.process.threads}), health on :${server.port}`
	);
	// Hold the scope open until the process is told to stop; closing it stops pg-boss gracefully.
	return yield* Effect.never;
}).pipe(
	Effect.provide(
		Layer.mergeAll(
			Queue.layerFromUrl(DATABASE_URL, { role: 'worker' }),
			Layer.mergeAll(Videos.layer, Segments.layer, Accounts.layer, Analyses.layer, Annotations.layer, AnalysisExports.layer).pipe(Layer.provide(DbLive)),
			// Optional: without VAPID keys the worker sends no browser notifications.
			WebPush.layerFromConfig({ publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY, subject: process.env.VAPID_SUBJECT }).pipe(
				Layer.provide(PushSubscriptionsLive)
			),
			Storage.layerFromConfig(r2.config),
			// Optional: without Supabase settings nothing is pushed and pages poll.
			Realtime.layerFromConfig({
				url: process.env.PUBLIC_SUPABASE_URL,
				anonKey: process.env.PUBLIC_SUPABASE_ANON_KEY,
				serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
				jwtSecret: process.env.SUPABASE_JWT_SECRET
			})
		)
	),
	Effect.scoped
);

const fiber = Effect.runFork(program);

const shutdown = async (signal: string) => {
	console.log(`${signal} received, shutting down`);
	health.ready = false;
	// Interrupting closes the scope: pg-boss stops gracefully (finishes active jobs, up to its timeout).
	await Effect.runPromise(Fiber.interrupt(fiber)).catch(() => {});
	server.stop();
	process.exit(0);
};
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
