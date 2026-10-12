import { Queue, Videos, type QueueError } from '@ttg/db';
import { Effect } from 'effect';
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
