import { Context, Effect, Layer, Schema } from 'effect';
import { PgBoss } from 'pg-boss';
import { JOB_CONFIG, JOB_NAMES, JobPayloads, singletonKey, type JobName, type JobPayload } from '@ttg/shared';

/** Any failure talking to the job queue. The cause is for logs only. */
export class QueueError extends Schema.TaggedError<QueueError>()('QueueError', {
	message: Schema.String,
	cause: Schema.optional(Schema.Defect())
}) {}

export interface Job<N extends JobName> {
	readonly id: string;
	readonly payload: JobPayload<N>;
}

export interface QueueService {
	/** Queue a job. Returns its id, or undefined when an identical job for the same entity is already queued. */
	readonly send: <N extends JobName>(name: N, payload: JobPayload<N>) => Effect.Effect<string | undefined, QueueError>;
	/**
	 * Process jobs of one kind (worker only). A failed handler is retried by pg-boss per `JOB_CONFIG`
	 * and a payload that does not match the schema fails without running the handler.
	 */
	readonly work: <N extends JobName, E>(
		name: N,
		handler: (job: Job<N>) => Effect.Effect<void, E>,
		options?: { concurrency?: number }
	) => Effect.Effect<void, QueueError>;
}

const wrap = (message: string) => (cause: unknown) => new QueueError({ message, cause });

export interface QueueOptions {
	/**
	 * `producer` (the app) only enqueues; `worker` also runs pg-boss maintenance and the schedules
	 * (the nightly retention sweep). pg-boss is safe with several instances.
	 */
	role: 'producer' | 'worker';
}

/** Job queue on Postgres (pg-boss, its own `pgboss` schema, created on start). */
export class Queue extends Context.Service<Queue, QueueService>()('ttg/db/Queue') {
	static layerFromUrl = (connectionString: string, options: QueueOptions) =>
		Layer.effect(
			Queue,
			Effect.gen(function* () {
				const isWorker = options.role === 'worker';
				const boss = yield* Effect.acquireRelease(
					Effect.tryPromise({
						try: async () => {
							const b = new PgBoss({
								connectionString,
								application_name: `ttg-${options.role}`,
								max: isWorker ? 6 : 3,
								supervise: isWorker,
								schedule: isWorker
							});
							// An unhandled 'error' event would crash the process.
							b.on('error', (e) => console.error('pg-boss error:', e.message));
							await b.start();
							// Idempotent: creating a queue that exists updates its options.
							for (const name of JOB_NAMES) {
								const c = JOB_CONFIG[name];
								await b.createQueue(name, {
									policy: c.policy,
									retryLimit: c.retryLimit,
									retryDelay: c.retryDelaySeconds,
									retryBackoff: true,
									expireInSeconds: c.expireInSeconds
								});
							}
							return b;
						},
						catch: wrap('Could not start the job queue')
					}),
					(b) => Effect.promise(() => b.stop({ graceful: true, timeout: 20_000 }).catch(() => undefined))
				);

				const send: QueueService['send'] = (name, payload) =>
					Effect.gen(function* () {
						const data = yield* Schema.encodeEffect(JobPayloads[name] as Schema.Codec<unknown, unknown>)(payload).pipe(
							Effect.mapError(wrap('Invalid job payload'))
						);
						const key = singletonKey(name, payload);
						const id = yield* Effect.tryPromise({
							try: () => boss.send(name, data as object, key ? { singletonKey: key } : {}),
							catch: wrap('Could not queue the job')
						});
						return id ?? undefined;
					});

				const work: QueueService['work'] = (name, handler, opts) =>
					Effect.tryPromise({
						try: async () => {
							// A scheduled job (the nightly sweep) is only scheduled once something consumes it.
							const cron = JOB_CONFIG[name].cron;
							if (isWorker && cron) await boss.schedule(name, cron);
							await boss.work(name, { batchSize: 1, localConcurrency: opts?.concurrency ?? 1 }, async ([job]) => {
								if (!job) return;
								const parsed = Schema.decodeUnknownResult(JobPayloads[name] as Schema.Decoder<unknown, never>)(job.data);
								if (parsed._tag === 'Failure') throw new Error(`Invalid payload for ${name}`);
								const exit = await Effect.runPromiseExit(handler({ id: job.id, payload: parsed.success as JobPayload<typeof name> }));
								if (exit._tag === 'Failure') {
									// Throwing hands the job back to pg-boss for retry or failure.
									throw new Error(`Job ${name} (${job.id}) failed`, { cause: exit.cause });
								}
							});
						},
						catch: wrap(`Could not register a worker for ${name}`)
					});

				return Queue.of({ send, work });
			})
		);
}
