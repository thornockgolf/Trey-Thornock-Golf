import { Db, Queue } from '@ttg/db';
import { Effect, Fiber, Layer } from 'effect';
import { healthResponse, type Health } from './health';
import { registerHandlers } from './handlers';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
	console.error('DATABASE_URL is not set');
	process.exit(1);
}
const PORT = Number(process.env.PORT ?? 8081);

const health: Health = { ready: false };

// Reachable only inside the Docker network (no published port).
const server = Bun.serve({
	port: PORT,
	fetch: (req) => healthResponse(health, req.method, new URL(req.url).pathname)
});

const program = Effect.gen(function* () {
	const handlers = yield* registerHandlers;
	health.ready = true;
	console.log(`worker ready: ${handlers.length} handler(s), health on :${server.port}`);
	// Hold the scope open until the process is told to stop; closing it stops pg-boss gracefully.
	return yield* Effect.never;
}).pipe(
	Effect.provide(Layer.mergeAll(Queue.layerFromUrl(DATABASE_URL, { role: 'worker' }), Db.layerFromUrl(DATABASE_URL, { max: 4 }))),
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
