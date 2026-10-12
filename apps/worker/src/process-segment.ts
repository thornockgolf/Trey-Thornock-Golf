import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { isLastAttempt, Segments } from '@ttg/db';
import { keys } from '@ttg/shared';
import { Cause, Effect } from 'effect';
import * as ff from './ffmpeg';
import { failWith, ProcessingError, type Attempt, type ProcessConfig } from './process-video';
import { Storage } from './storage';

/**
 * Error codes stored on a failed segment (`analysis_segments.error_code`), besides those shared with videos
 * (`DOWNLOAD_FAILED`, `TRANSCODE_FAILED`, `UPLOAD_FAILED`, `PROCESSING_FAILED`, `SOURCE_MISSING`).
 */
export type SegmentCode =
	| 'INVALID_RECORDING' // ffprobe could not read it, or it has neither audio nor video
	| 'SEGMENT_TOO_SHORT'; // much shorter than the range it was recorded for: final, retrying cannot help

/** A recording up to this much shorter than its slot is padded (silence, last picture held); more than that is a failed take. */
export const SHORT_TOLERANCE_MS = 2000;
/** The normalized clip must be this close to the slot length. */
export const LENGTH_TOLERANCE_MS = 250;

export type SegmentOutcome =
	| { readonly _tag: 'Skipped' } // nothing to process (already ready, replaced, or no such row)
	| { readonly _tag: 'Ready'; readonly replaced: number }
	| { readonly _tag: 'Failed'; readonly code: string };

/**
 * The pipeline for one recording, without the retry policy: claim, download the raw file, probe (measuring the
 * length when the container does not say), normalize to MP4/AAC at exactly the slot's length, upload (overwriting,
 * so a rerun is safe), re-probe the output, then `commit`, which is the only step that changes the analysis: it
 * replaces the overlapping live segments in one transaction. Until then the previous segments stay live. The raw
 * recording in R2 is kept. The temp dir is removed on success, failure and interruption.
 */
export const runSegmentPipeline = (segmentId: string, config: ProcessConfig) =>
	Effect.gen(function* () {
		const segments = yield* Segments;
		const storage = yield* Storage;
		const seg = yield* segments.claimForProcessing(segmentId);
		if (!seg) return undefined;
		if (!seg.sourceKey) return yield* new ProcessingError({ code: 'SOURCE_MISSING', final: true, message: 'The segment has no recording' });
		const lengthMs = seg.endMs - seg.startMs;

		const dir = yield* Effect.acquireRelease(
			Effect.promise(async () => {
				await mkdir(config.workDir, { recursive: true });
				return mkdtemp(join(config.workDir, `${segmentId}-`));
			}),
			(d) => Effect.promise(() => rm(d, { recursive: true, force: true }))
		);
		const limits = { threads: config.threads, timeoutMs: config.stepTimeoutMs };
		const ext = seg.sourceKey.split('.').pop() ?? 'bin';
		const src = join(dir, `recording.${/^[a-z0-9]{1,5}$/.test(ext) ? ext : 'bin'}`);
		const out = join(dir, 'segment.mp4');

		yield* storage.download(seg.sourceKey, src).pipe(Effect.mapError(failWith('DOWNLOAD_FAILED')));

		const info = yield* ff.probe(src, config.stepTimeoutMs).pipe(Effect.mapError(failWith('INVALID_RECORDING')));
		if (!info.hasVideo && !info.hasAudio) return yield* new ProcessingError({ code: 'INVALID_RECORDING', final: false, message: 'No audio or video stream' });
		const inputMs = info.durationMs ?? (yield* ff.measureDurationMs(src, { ...limits, timeoutMs: config.transcodeTimeoutMs }).pipe(Effect.mapError(failWith('INVALID_RECORDING'))));
		if (inputMs === undefined || inputMs < lengthMs - SHORT_TOLERANCE_MS) {
			return yield* new ProcessingError({
				code: 'SEGMENT_TOO_SHORT',
				final: true,
				message: `The recording is ${inputMs ?? 0} ms but its slot is ${lengthMs} ms`
			});
		}

		yield* ff
			.normalizeSegment(src, out, { hasVideo: info.hasVideo, hasAudio: info.hasAudio, lengthMs }, { ...limits, timeoutMs: config.transcodeTimeoutMs })
			.pipe(Effect.mapError(failWith('TRANSCODE_FAILED')));
		const result = yield* ff.probe(out, config.stepTimeoutMs).pipe(Effect.mapError(failWith('TRANSCODE_FAILED')));
		if ((!result.hasAudio && !result.hasVideo) || result.durationMs === undefined || Math.abs(result.durationMs - lengthMs) > LENGTH_TOLERANCE_MS) {
			return yield* new ProcessingError({
				code: 'TRANSCODE_FAILED',
				final: false,
				message: `The normalized clip is ${result.durationMs ?? 'unreadable'} ms, expected ${lengthMs} ms`
			});
		}

		const clipKey = keys.analysisSegment(seg.analysisId, segmentId);
		yield* storage.upload(clipKey, out, info.hasVideo ? 'video/mp4' : 'audio/mp4').pipe(Effect.mapError(failWith('UPLOAD_FAILED')));
		const committed = yield* segments.commit(segmentId, { clipKey, hasVideo: info.hasVideo });
		return committed;
	}).pipe(Effect.scoped);

/**
 * `analysis.segment.uploaded` handler: the pipeline plus the failure policy of `processVideo`. A final failure
 * (too short, no recording) marks the segment `failed` and completes the job; anything else is retried by pg-boss and
 * marks it `failed` on the last attempt. A failed segment never touches the live analysis. Interruption records nothing.
 */
export const processSegment = (segmentId: string, attempt: Attempt, config: ProcessConfig) =>
	Effect.gen(function* () {
		const segments = yield* Segments;
		const exit = yield* Effect.exit(runSegmentPipeline(segmentId, config));
		if (exit._tag === 'Success') {
			if (!exit.value) {
				yield* Effect.logInfo(`segment ${segmentId}: nothing to process`);
				return { _tag: 'Skipped' } as SegmentOutcome;
			}
			return { _tag: 'Ready', replaced: exit.value.replaced } as SegmentOutcome;
		}
		const cause = exit.cause;
		if (Cause.hasInterruptsOnly(cause)) return yield* Effect.failCause(cause);
		const err = Cause.findErrorOption(cause);
		const pe = err._tag === 'Some' && err.value instanceof ProcessingError ? err.value : undefined;
		const code = pe?.code ?? 'PROCESSING_FAILED';
		const final = pe?.final ?? false;
		yield* Effect.logWarning(`segment ${segmentId}: ${code} (attempt ${attempt.retryCount + 1} of ${attempt.retryLimit + 1})`, cause);
		if (final || isLastAttempt(attempt)) {
			yield* segments.markFailed(segmentId, code);
			if (final) return { _tag: 'Failed', code } as SegmentOutcome;
		}
		return yield* Effect.failCause(cause);
	});
