import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { AnalysisExports, Analyses, Annotations, isLastAttempt, Segments, Videos } from '@ttg/db';
import { keys } from '@ttg/shared';
import { Cause, Effect } from 'effect';
import { assemble, renderOverlayFrames, type AssembleClip } from './assemble';
import { overlayIntervals } from './export-timeline';
import * as ff from './ffmpeg';
import { failWith, ProcessingError, type Attempt, type ProcessConfig } from './process-video';
import { Storage } from './storage';

/** The export may differ from the video by this much (container rounding) before it is rejected. */
export const EXPORT_LENGTH_TOLERANCE_MS = 500;

export type AssembleOutcome =
	| { readonly _tag: 'Skipped' } // no request, or already finished
	| { readonly _tag: 'Ready'; readonly sizeBytes: number; readonly clips: number; readonly overlayFrames: boolean }
	| { readonly _tag: 'Failed'; readonly code: string };

/**
 * The pipeline for one export, without the retry policy: claim, download the processed video and the live commentary
 * clips, draw the annotations, run ffmpeg (see `assemble.ts` for how and why), check the result's length, upload it
 * (overwriting, so a rerun is safe) and mark the export ready. The analysis itself is never changed. The temp dir is
 * removed on success, failure and interruption.
 */
export const runAssemblePipeline = (analysisId: string, config: ProcessConfig) =>
	Effect.gen(function* () {
		const exports = yield* AnalysisExports;
		const storage = yield* Storage;
		const claimed = yield* exports.claim(analysisId);
		if (!claimed) return undefined;

		const analysis = yield* (yield* Analyses).find(analysisId);
		const video = analysis ? yield* (yield* Videos).find(analysis.videoId) : undefined;
		if (!analysis || !video?.processedKey) {
			return yield* new ProcessingError({ code: 'SOURCE_MISSING', final: true, message: 'The analysis or its processed video is gone' });
		}
		const live = (yield* (yield* Segments).listLive(analysisId)).filter((s) => s.status === 'ready' && s.clipKey);
		const annotations = yield* (yield* Annotations).listByVideo(video.id);

		const dir = yield* Effect.acquireRelease(
			Effect.promise(async () => {
				await mkdir(config.workDir, { recursive: true });
				return mkdtemp(join(config.workDir, `export-${analysisId}-`));
			}),
			(d) => Effect.promise(() => rm(d, { recursive: true, force: true }))
		);
		const limits = { threads: config.threads, timeoutMs: config.stepTimeoutMs };
		const videoPath = join(dir, 'video.mp4');
		const out = join(dir, 'export.mp4');

		yield* storage.download(video.processedKey, videoPath).pipe(Effect.mapError(failWith('DOWNLOAD_FAILED')));
		const info = yield* ff.probe(videoPath, config.stepTimeoutMs).pipe(Effect.mapError(failWith('TRANSCODE_FAILED')));
		if (!info.hasVideo || info.durationMs === undefined || info.width <= 0) {
			return yield* new ProcessingError({ code: 'TRANSCODE_FAILED', final: false, message: 'The processed video is unreadable' });
		}

		// Pieces cut from one recording share a clip: download each file once.
		const files = new Map<string, { path: string; hasAudio: boolean; mono: boolean }>();
		for (const key of new Set(live.map((s) => s.clipKey!))) {
			const path = join(dir, `clip-${files.size}.mp4`);
			yield* storage.download(key, path).pipe(Effect.mapError(failWith('DOWNLOAD_FAILED')));
			const clip = yield* ff.probe(path, config.stepTimeoutMs).pipe(Effect.mapError(failWith('TRANSCODE_FAILED')));
			files.set(key, { path, hasAudio: clip.hasAudio, mono: clip.audioChannels === 1 });
		}
		const clips: AssembleClip[] = live.flatMap((s) => {
			const f = files.get(s.clipKey!)!;
			return f.hasAudio ? [{ path: f.path, startMs: s.startMs, endMs: s.endMs, clipStartMs: s.clipStartMs, mono: f.mono }] : [];
		});

		const intervals = overlayIntervals(annotations, info.durationMs);
		const overlayList = yield* Effect.tryPromise({
			try: () => renderOverlayFrames(intervals, info.width, info.height, dir),
			catch: (e) => failWith('RENDER_FAILED')({ message: String(e) })
		});

		yield* assemble(
			{ video: videoPath, videoHasAudio: info.hasAudio, durationMs: info.durationMs, fps: info.fps ?? 30, overlayList, clips, output: out, threads: config.threads },
			{ threads: config.threads, timeoutMs: config.transcodeTimeoutMs }
		).pipe(Effect.mapError(failWith('TRANSCODE_FAILED')));
		const result = yield* ff.probe(out, config.stepTimeoutMs).pipe(Effect.mapError(failWith('TRANSCODE_FAILED')));
		if (!result.hasVideo || result.durationMs === undefined || Math.abs(result.durationMs - info.durationMs) > EXPORT_LENGTH_TOLERANCE_MS) {
			return yield* new ProcessingError({
				code: 'TRANSCODE_FAILED',
				final: false,
				message: `The export is ${result.durationMs ?? 'unreadable'} ms, expected ${info.durationMs} ms`
			});
		}

		const outputKey = keys.analysisExport(analysisId);
		yield* storage.upload(outputKey, out, 'video/mp4').pipe(Effect.mapError(failWith('UPLOAD_FAILED')));
		const head = yield* storage.head(outputKey).pipe(Effect.mapError(failWith('UPLOAD_FAILED')));
		const sizeBytes = head?.sizeBytes ?? 0;
		yield* exports.markReady(analysisId, { outputKey, sizeBytes });
		return { sizeBytes, clips: clips.length, overlayFrames: overlayList !== undefined };
	}).pipe(Effect.scoped);

/**
 * `analysis.assemble` handler: the pipeline plus the failure policy of `processSegment`. A final failure (the video is
 * gone) marks the export `failed` and completes the job; anything else is retried by pg-boss and marks it `failed` on
 * the last attempt. Interruption records nothing.
 */
export const processAssemble = (analysisId: string, attempt: Attempt, config: ProcessConfig) =>
	Effect.gen(function* () {
		const exports = yield* AnalysisExports;
		const exit = yield* Effect.exit(runAssemblePipeline(analysisId, config));
		if (exit._tag === 'Success') {
			if (!exit.value) {
				yield* Effect.logInfo(`export ${analysisId}: nothing to process`);
				return { _tag: 'Skipped' } as AssembleOutcome;
			}
			return { _tag: 'Ready', ...exit.value } as AssembleOutcome;
		}
		const cause = exit.cause;
		if (Cause.hasInterruptsOnly(cause)) return yield* Effect.failCause(cause);
		const err = Cause.findErrorOption(cause);
		const pe = err._tag === 'Some' && err.value instanceof ProcessingError ? err.value : undefined;
		const code = pe?.code ?? 'PROCESSING_FAILED';
		const final = pe?.final ?? false;
		yield* Effect.logWarning(`export ${analysisId}: ${code} (attempt ${attempt.retryCount + 1} of ${attempt.retryLimit + 1})`, cause);
		if (final || isLastAttempt(attempt)) {
			yield* exports.markFailed(analysisId, code);
			if (final) return { _tag: 'Failed', code } as AssembleOutcome;
		}
		return yield* Effect.failCause(cause);
	});
