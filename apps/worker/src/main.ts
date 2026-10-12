import { Db, Queue, Segments, Videos } from '@ttg/db';
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
			Layer.mergeAll(Videos.layer, Segments.layer).pipe(Layer.provide(Db.layerFromUrl(DATABASE_URL, { max: 4 }))),
			Storage.layerFromConfig(r2.config)
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
