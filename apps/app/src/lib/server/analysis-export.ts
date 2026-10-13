import { AnalysisExports, Annotations, Queue, Segments, type AnalysisExport } from '@ttg/db';
import type { ExportDto } from '@ttg/shared';
import { Effect } from 'effect';
import { viewableAnalysis } from './analyses';
import { requireRole } from './auth';
import { Conflict } from './errors';
import { R2 } from './r2';

const EXPORT_DOWNLOAD_TTL_S = 15 * 60;

/** The export as the API shows it, with a presigned download only while it is `ready` and its file exists. */
const toDto = (e: AnalysisExport | undefined, title: string | null) =>
	Effect.gen(function* () {
		if (!e) return { status: 'none', requestedAt: null, readyAt: null, sizeBytes: null, errorCode: null, download: null } satisfies ExportDto;
		let download: ExportDto['download'] = null;
		if (e.status === 'ready' && e.outputKey) {
			const filename = `${(title ?? 'swing-analysis').trim() || 'swing-analysis'}.mp4`;
			const signed = yield* (yield* R2).presignGet({ key: e.outputKey, expiresInSeconds: EXPORT_DOWNLOAD_TTL_S, downloadName: filename });
			download = { url: signed.url, expiresAt: signed.expiresAt.toISOString(), filename };
		}
		return {
			status: e.status,
			requestedAt: e.requestedAt.toISOString(),
			readyAt: e.readyAt?.toISOString() ?? null,
			sizeBytes: e.sizeBytes,
			errorCode: e.status === 'failed' ? e.errorCode : null,
			download
		} satisfies ExportDto;
	});

/**
 * `POST /api/analyses/:id/export`: coach only. Ask for one MP4 with the video, the annotations drawn on it and the
 * commentary mixed in at its exact times (the `analysis.assemble` job). Answers 202 with the state; a request while
 * one is queued or running changes nothing. Asking again after it finished or failed makes a fresh one. 409 when
 * there is nothing to put in it yet.
 */
export const requestExport = Effect.gen(function* () {
	const coach = yield* requireRole('coach');
	const { analysis } = yield* viewableAnalysis(coach);
	const [live, annotations] = yield* Effect.all([(yield* Segments).listLive(analysis.id), (yield* Annotations).countByVideo(analysis.videoId)]);
	if (live.length === 0 && annotations === 0) return yield* new Conflict({ message: 'Record commentary or draw on the video first; there is nothing to export yet' });
	const exports = yield* AnalysisExports;
	const { export: state, started } = yield* exports.request(analysis.id);
	if (started) {
		// If the job cannot be queued the request is closed as failed, so the coach can ask again at once.
		yield* (yield* Queue).send('analysis.assemble', { analysis_id: analysis.id }).pipe(
			Effect.tapError(() => exports.markFailed(analysis.id, 'QUEUE_FAILED').pipe(Effect.ignore))
		);
	}
	return yield* toDto(state, analysis.title);
});

/** `GET /api/analyses/:id/export`: coach only. Where the export stands, and a 15 minute download link once it is ready. */
export const getExport = Effect.gen(function* () {
	const coach = yield* requireRole('coach');
	const { analysis } = yield* viewableAnalysis(coach);
	return yield* toDto(yield* (yield* AnalysisExports).find(analysis.id), analysis.title);
});
