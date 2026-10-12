import { Queue, Videos, type QueueError } from '@ttg/db';
import { Effect, Schedule } from 'effect';
import { defaultProcessConfig, processVideo, type ProcessConfig } from './process-video';
import { Storage } from './storage';

/** Video jobs at once: 1-2 fit the 4 vCPU VPS (spec 3.C.2). */
export const MAX_CONCURRENCY = 2;

/** WORKER_CONCURRENCY parsed and clamped to 1..MAX_CONCURRENCY (default 1). */
export const concurrencyFromEnv = (value: string | undefined): number => {
	const n = Number.parseInt(value ?? '', 10);
	return Number.isFinite(n) ? Math.min(MAX_CONCURRENCY, Math.max(1, n)) : 1;
};

export interface WorkerSettings {
	readonly concurrency: number;
	readonly process: ProcessConfig;
}

const positive = (value: string | undefined, fallback: number) => {
	const n = Number(value);
	return Number.isFinite(n) && n > 0 ? n : fallback;
};

/** Settings from the environment (WORKER_CONCURRENCY, WORK_DIR, FFMPEG_THREADS, FFMPEG_TIMEOUT_MS). */
export const settingsFromEnv = (env: Record<string, string | undefined>): WorkerSettings => ({
	concurrency: concurrencyFromEnv(env.WORKER_CONCURRENCY),
	process: {
		workDir: env.WORK_DIR || defaultProcessConfig.workDir,
		threads: Math.floor(positive(env.FFMPEG_THREADS, defaultProcessConfig.threads)),
		transcodeTimeoutMs: positive(env.FFMPEG_TIMEOUT_MS, defaultProcessConfig.transcodeTimeoutMs),
		stepTimeoutMs: defaultProcessConfig.stepTimeoutMs
	}
});

/**
 * Register every job consumer and return the queue names. Part D adds `analysis.segment.uploaded`
 * and the nightly `retention.sweep`; until then their jobs wait in Postgres.
 */
export const registerHandlers = (settings: WorkerSettings): Effect.Effect<readonly string[], QueueError, Queue | Videos | Storage> =>
	Effect.gen(function* () {
		const q = yield* Queue;
		// The queue runs handlers outside this fiber, so give them the services now.
		const context = yield* Effect.context<Videos | Storage>();
		yield* q.work(
			'video.uploaded',
			(job) =>
				processVideo(job.payload.video_id, job, settings.process).pipe(
					Effect.tap((o) => Effect.logInfo(`video ${job.payload.video_id}: ${o._tag}`)),
					Effect.provideContext(context)
				),
			{ concurrency: settings.concurrency }
		);
		return ['video.uploaded'];
	});

/** A `processing` video with no live job this long is failed by the sweep (covers the clock skew of a job just handed back). */
export const STALLED_GRACE_SECONDS = 10 * 60;
export const STALLED_SWEEP_EVERY = '5 minutes' as const;

/**
 * Fail videos whose job is gone: when the worker dies during a job's last attempt, pg-boss expires the job to
 * `failed` without running our handler, so the row would stay `processing` forever.
 */
export const sweepStalled = Effect.gen(function* () {
	const ids = yield* (yield* Videos).failStalled(STALLED_GRACE_SECONDS);
	if (ids.length > 0) yield* Effect.logWarning(`failed ${ids.length} stalled video(s): ${ids.join(', ')}`);
	return ids;
});

/** Runs `sweepStalled` now and then every few minutes; an error is logged and the next run still happens. */
export const stalledSweeper = sweepStalled.pipe(
	Effect.catchCause((cause) => Effect.logError('stalled-video sweep failed', cause)),
	Effect.repeat(Schedule.spaced(STALLED_SWEEP_EVERY))
);
