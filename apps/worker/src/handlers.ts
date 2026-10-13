import { Accounts, AnalysisExports, Analyses, Annotations, Queue, Segments, Videos, type QueueError } from '@ttg/db';
import { Effect, Schedule } from 'effect';
import { defaultProcessConfig, processVideo, type ProcessConfig } from './process-video';
import { deleteAccount } from './process-account-delete';
import { processAssemble } from './process-assemble';
import { processSegment } from './process-segment';
import { sweepAbandonedUploads, sweepReplacedSegments } from './retention';
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
 * Register every job consumer and return the queue names.
 */
export const registerHandlers = (settings: WorkerSettings): Effect.Effect<readonly string[], QueueError, Queue | Videos | Segments | Accounts | Analyses | Annotations | AnalysisExports | Storage> =>
	Effect.gen(function* () {
		const q = yield* Queue;
		// The queue runs handlers outside this fiber, so give them the services now.
		const context = yield* Effect.context<Videos | Segments | Accounts | Analyses | Annotations | AnalysisExports | Storage | Queue>();
		yield* q.work(
			'video.uploaded',
			(job) =>
				processVideo(job.payload.video_id, job, settings.process).pipe(
					Effect.tap((o) => Effect.logInfo(`video ${job.payload.video_id}: ${o._tag}`)),
					Effect.provideContext(context)
				),
			{ concurrency: settings.concurrency }
		);
		yield* q.work(
			'analysis.segment.uploaded',
			(job) =>
				processSegment(job.payload.segment_id, job, settings.process).pipe(
					Effect.tap((o) => Effect.logInfo(`segment ${job.payload.segment_id}: ${o._tag}`)),
					Effect.provideContext(context)
				),
			{ concurrency: settings.concurrency }
		);
		// A coach's request for the flattened export of an analysis (video + annotations + commentary in one MP4).
		yield* q.work(
			'analysis.assemble',
			(job) =>
				processAssemble(job.payload.analysis_id, job, settings.process).pipe(
					Effect.tap((o) => Effect.logInfo(`export ${job.payload.analysis_id}: ${o._tag}`)),
					Effect.provideContext(context)
				),
			{ concurrency: settings.concurrency }
		);
		// Coach-triggered account deletion: files, then rows. Queued by the app after it closed billing and sign-in.
		yield* q.work('account.delete', (job) =>
			deleteAccount(job.payload.user_id).pipe(
				Effect.tap((o) => Effect.logInfo(`account ${job.payload.user_id}: ${o._tag}`)),
				Effect.provideContext(context)
			)
		);
		// Nightly (03:00, scheduled by the queue): abandoned video uploads, then replaced coach recordings past 30 days.
		// Each runs on its own, so a failure in one does not skip the other (the job still fails and is retried once).
		yield* q.work('retention.sweep', () =>
			Effect.gen(function* () {
				const uploads = yield* Effect.exit(sweepAbandonedUploads);
				const segments = yield* Effect.exit(sweepReplacedSegments);
				if (uploads._tag === 'Failure') return yield* Effect.failCause(uploads.cause);
				if (segments._tag === 'Failure') return yield* Effect.failCause(segments.cause);
			}).pipe(Effect.provideContext(context))
		);
		return ['video.uploaded', 'analysis.segment.uploaded', 'analysis.assemble', 'account.delete', 'retention.sweep'];
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

/** Same as `sweepStalled`, for recordings: a `processing` segment whose job is gone is failed so the coach can retry. */
export const sweepStalledSegments = Effect.gen(function* () {
	const ids = yield* (yield* Segments).failStalled(STALLED_GRACE_SECONDS);
	if (ids.length > 0) yield* Effect.logWarning(`failed ${ids.length} stalled segment(s): ${ids.join(', ')}`);
	return ids;
});

/** Runs `sweepStalled` now and then every few minutes; an error is logged and the next run still happens. */
export const stalledSweeper = Effect.all([sweepStalled, sweepStalledSegments], { concurrency: 2, discard: true }).pipe(
	Effect.catchCause((cause) => Effect.logError('stalled-video sweep failed', cause)),
	Effect.repeat(Schedule.spaced(STALLED_SWEEP_EVERY))
);
