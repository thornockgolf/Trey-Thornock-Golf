import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { isLastAttempt, Videos } from '@ttg/db';
import { keys, MAX_VIDEO_MS } from '@ttg/shared';
import { Cause, Effect, Schema } from 'effect';
import * as ff from './ffmpeg';
import { publishJobNotification } from './publish';
import { Storage } from './storage';

/** Error codes stored on a failed video (`videos.error_code`). */
export type ProcessingCode =
	| 'DURATION_EXCEEDED' // longer than MAX_VIDEO_MS: final at once, retrying cannot help
	| 'SOURCE_MISSING' // the row has no source key: final at once
	| 'INVALID_VIDEO' // ffprobe could not read it, or it has no video stream
	| 'DOWNLOAD_FAILED'
	| 'TRANSCODE_FAILED' // transcode, poster, sprite or the output check
	| 'UPLOAD_FAILED'
	| 'RENDER_FAILED' // drawing the annotations of an analysis export
	| 'PROCESSING_FAILED'; // anything else (database, defect)

/** A failed processing step. `final` failures are recorded at once; others are retried by pg-boss. */
export class ProcessingError extends Schema.TaggedError<ProcessingError>()('ProcessingError', {
	code: Schema.String,
	final: Schema.Boolean,
	message: Schema.String,
	cause: Schema.optional(Schema.Defect())
}) {}

export const failWith = (code: ProcessingCode | 'INVALID_RECORDING', final = false) => (cause: { message: string }) =>
	new ProcessingError({ code, final, message: cause.message, cause });

export interface ProcessConfig {
	/** Parent of the per-job temp dirs; mount a size-limited volume here in production. */
	readonly workDir: string;
	/** `-threads` cap for each ffmpeg process. */
	readonly threads: number;
	/** Timeout for the transcode. */
	readonly transcodeTimeoutMs: number;
	/** Timeout for probes, poster and sprite. */
	readonly stepTimeoutMs: number;
}

export const defaultProcessConfig: ProcessConfig = {
	workDir: '/tmp/ttg-work',
	threads: 2,
	transcodeTimeoutMs: 30 * 60_000,
	stepTimeoutMs: 5 * 60_000
};

/**
 * A container may round the length up a little; a clip that is "5:00" on the phone must not fail.
 * Anything longer than MAX_VIDEO_MS plus this grace is rejected.
 */
export const DURATION_GRACE_MS = 1000;

export interface Attempt {
	readonly retryCount: number;
	readonly retryLimit: number;
}

/** What the run did (for logs and tests). */
export type ProcessOutcome =
	| { readonly _tag: 'Skipped' } // nothing to process (already ready or failed, or no such row)
	| { readonly _tag: 'Ready' }
	| { readonly _tag: 'Failed'; readonly code: string };

/**
 * The pipeline for one upload, without the retry policy: claim, download, probe, transcode, poster,
 * sprite + VTT, upload (overwriting, so a rerun after a crash is safe), re-probe the output, mark ready.
 * The source in R2 is never deleted. The temp dir is removed on success, failure and interruption.
 */
export const runPipeline = (videoId: string, config: ProcessConfig) =>
	Effect.gen(function* () {
		const videos = yield* Videos;
		const storage = yield* Storage;
		const video = yield* videos.claimForProcessing(videoId);
		if (!video) return false;
		if (!video.sourceKey) return yield* new ProcessingError({ code: 'SOURCE_MISSING', final: true, message: 'The video has no source key' });

		const dir = yield* Effect.acquireRelease(
			Effect.promise(async () => {
				await mkdir(config.workDir, { recursive: true });
				return mkdtemp(join(config.workDir, `${videoId}-`));
			}),
			(d) => Effect.promise(() => rm(d, { recursive: true, force: true }))
		);
		const limits = { threads: config.threads, timeoutMs: config.stepTimeoutMs };
		const ext = video.sourceKey.split('.').pop() ?? 'bin';
		const src = join(dir, `source.${/^[a-z0-9]{1,5}$/.test(ext) ? ext : 'bin'}`);
		const out = { video: join(dir, 'video.mp4'), poster: join(dir, 'poster.jpg'), sprite: join(dir, 'sprite.jpg'), vtt: join(dir, 'sprite.vtt') };

		yield* storage.download(video.sourceKey, src).pipe(Effect.mapError(failWith('DOWNLOAD_FAILED')));

		const info = yield* ff.probe(src, config.stepTimeoutMs).pipe(Effect.mapError(failWith('INVALID_VIDEO')));
		if (!info.hasVideo) return yield* new ProcessingError({ code: 'INVALID_VIDEO', final: false, message: 'No video stream' });
		if (info.durationMs !== undefined && info.durationMs > MAX_VIDEO_MS + DURATION_GRACE_MS) {
			return yield* new ProcessingError({
				code: 'DURATION_EXCEEDED',
				final: true,
				message: `Duration ${info.durationMs} ms is over the ${MAX_VIDEO_MS} ms limit`
			});
		}

		yield* ff.transcode(src, out.video, info, { ...limits, timeoutMs: config.transcodeTimeoutMs }).pipe(Effect.mapError(failWith('TRANSCODE_FAILED')));
		const result = yield* ff.probe(out.video, config.stepTimeoutMs).pipe(Effect.mapError(failWith('TRANSCODE_FAILED')));
		if (!result.hasVideo || result.durationMs === undefined || result.width === 0) {
			return yield* new ProcessingError({ code: 'TRANSCODE_FAILED', final: false, message: 'The transcoded file has no readable video' });
		}
		// A probed or transcoded length can land just over the limit (the container rounds up).
		if (result.durationMs > MAX_VIDEO_MS + DURATION_GRACE_MS) {
			return yield* new ProcessingError({ code: 'DURATION_EXCEEDED', final: true, message: `Duration ${result.durationMs} ms is over the limit` });
		}

		const layout = ff.spriteLayout(result.durationMs, result.width, result.height);
		yield* ff.poster(out.video, out.poster, result.durationMs, limits).pipe(Effect.mapError(failWith('TRANSCODE_FAILED')));
		yield* ff.sprite(out.video, out.sprite, layout, limits).pipe(Effect.mapError(failWith('TRANSCODE_FAILED')));
		yield* ff.writeSpriteVtt(out.vtt, layout, result.durationMs).pipe(Effect.mapError(failWith('TRANSCODE_FAILED')));

		const k = {
			video: keys.processedVideo(videoId),
			poster: keys.poster(videoId),
			sprite: keys.sprite(videoId),
			vtt: keys.spriteVtt(videoId)
		};
		yield* Effect.all(
			[
				storage.upload(k.video, out.video, 'video/mp4'),
				storage.upload(k.poster, out.poster, 'image/jpeg'),
				storage.upload(k.sprite, out.sprite, 'image/jpeg'),
				storage.upload(k.vtt, out.vtt, 'text/vtt')
			],
			{ concurrency: 2, discard: true }
		).pipe(Effect.mapError(failWith('UPLOAD_FAILED')));

		const readyNote = yield* videos.markReady(videoId, {
			processedKey: k.video,
			thumbnailKey: k.poster,
			spriteKey: k.sprite,
			durationMs: result.durationMs,
			// The forced constant rate, snapped (the probe of a 30000/1001 file reads 29.97003...).
			fps: ff.outputFrameRate(result.fps).value,
			width: result.width,
			height: result.height
		});
		yield* publishJobNotification(readyNote, 'video.ready', { videoId, status: 'ready' });
		return true;
	}).pipe(Effect.scoped);

/**
 * `video.uploaded` handler: the pipeline plus the failure policy (spec 3.C.2). A final failure
 * (too long, no source) marks the row `failed` and completes the job. Any other failure is retried by
 * pg-boss (the row stays `processing`) and marks the row `failed` only on the last attempt, then
 * still fails so pg-boss records the job as failed. Interruption (worker stopping, claim lost) records
 * nothing; pg-boss retries the job.
 */
export const processVideo = (videoId: string, attempt: Attempt, config: ProcessConfig = defaultProcessConfig) =>
	Effect.gen(function* () {
		const videos = yield* Videos;
		const exit = yield* Effect.exit(runPipeline(videoId, config));
		if (exit._tag === 'Success') {
			if (!exit.value) yield* Effect.logInfo(`video ${videoId}: nothing to process`);
			return (exit.value ? { _tag: 'Ready' } : { _tag: 'Skipped' }) as ProcessOutcome;
		}
		const cause = exit.cause;
		if (Cause.hasInterruptsOnly(cause)) return yield* Effect.failCause(cause);
		const err = Cause.findErrorOption(cause);
		const pe = err._tag === 'Some' && err.value instanceof ProcessingError ? err.value : undefined;
		const code = pe?.code ?? 'PROCESSING_FAILED';
		const final = pe?.final ?? false;
		yield* Effect.logWarning(`video ${videoId}: ${code} (attempt ${attempt.retryCount + 1} of ${attempt.retryLimit + 1})`, cause);
		if (final || isLastAttempt(attempt)) {
			const note = yield* videos.markFailed(videoId, code);
			yield* publishJobNotification(note, 'video.failed', { videoId, status: 'failed', errorCode: code });
			if (final) return { _tag: 'Failed', code } as ProcessOutcome;
		}
		// Not final: hand the job back to pg-boss (retry, or record the job as failed on the last attempt).
		return yield* Effect.failCause(cause);
	});
