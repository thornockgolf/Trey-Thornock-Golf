import { Queue, Segments, type Segment } from '@ttg/db';
import {
	CreateSegmentRequest,
	MAX_SEGMENT_BYTES,
	MAX_SEGMENT_MS,
	MIN_SEGMENT_MS,
	REPLACED_RETENTION_DAYS,
	SEGMENT_TYPES,
	keys,
	type CreateSegmentResponse,
	type ManifestResponse,
	type SegmentDto
} from '@ttg/shared';
import { Effect } from 'effect';
import { viewableAnalysis } from './analyses';
import { currentUser, requireRole } from './auth';
import { decodeBody } from './decode';
import { Conflict, NotFound, ValidationError } from './errors';
import { R2 } from './r2';
import { RequestContext } from './request-context';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export const toSegmentDto = (s: Segment): SegmentDto => ({
	id: s.id,
	startMs: s.startMs,
	endMs: s.endMs,
	status: s.status,
	errorCode: s.errorCode,
	createdAt: s.createdAt.toISOString()
});

/** The `:segmentId` of this analysis. A segment of another analysis is a 404 (nothing leaks across analyses). */
const ownSegment = (analysisId: string) =>
	Effect.gen(function* () {
		const { event } = yield* RequestContext;
		const id = event.params.segmentId ?? '';
		if (!UUID.test(id)) return yield* new NotFound({ message: 'Segment not found' });
		const seg = yield* (yield* Segments).find(id);
		if (!seg || seg.analysisId !== analysisId || seg.replacedAt) return yield* new NotFound({ message: 'Segment not found' });
		return seg;
	});

const rangeFrom = (q: URLSearchParams) => {
	const a = q.get('startMs');
	const b = q.get('endMs');
	if (a === null || b === null) return undefined;
	const startMs = Number(a);
	const endMs = Number(b);
	return Number.isInteger(startMs) && Number.isInteger(endMs) && startMs >= 0 && endMs > startMs ? { startMs, endMs } : null;
};

/**
 * `GET /api/analyses/:id/segments`: the segments that make up the analysis now (coach). With `?startMs=&endMs=` it
 * also says how many annotations start inside that range, so the coach can be asked to keep or remove them before
 * re-recording it.
 */
export const listSegments = Effect.gen(function* () {
	const coach = yield* requireRole('coach');
	const { analysis } = yield* viewableAnalysis(coach);
	const { event } = yield* RequestContext;
	const range = rangeFrom(event.url.searchParams);
	if (range === null) return yield* new ValidationError({ message: 'Invalid request: check startMs, endMs' });
	const segments = yield* Segments;
	const live = yield* segments.listLive(analysis.id);
	return {
		segments: live.map(toSegmentDto),
		annotationsInRange: range ? yield* segments.countAnnotationsIn(analysis.id, range.startMs, range.endMs) : null
	};
});

/**
 * `POST /api/analyses/:id/segments`: coach only. Record (or re-record) `startMs`..`endMs`. Creates a pending segment
 * and a presigned PUT for the raw recording. Nothing in the analysis changes yet: the old segments stay live until
 * the worker has processed the new one, so a failed upload or a cancel leaves the analysis as it was.
 */
export const createSegment = Effect.gen(function* () {
	const coach = yield* requireRole('coach');
	const body = yield* decodeBody(CreateSegmentRequest);
	const { analysis, video } = yield* viewableAnalysis(coach);
	const bad = (what: string) => new ValidationError({ message: `Invalid request: check ${what}` });

	const length = body.endMs - body.startMs;
	if (length < MIN_SEGMENT_MS || length > MAX_SEGMENT_MS) return yield* bad('startMs, endMs');
	if (video.status !== 'ready' || video.durationMs === null) return yield* new Conflict({ message: 'The video is not ready yet' });
	if (body.endMs > video.durationMs) return yield* bad('endMs');
	if (body.sizeBytes > MAX_SEGMENT_BYTES) return yield* bad('sizeBytes');

	const id = crypto.randomUUID();
	const ext = SEGMENT_TYPES[body.contentType];
	const sourceKey = keys.analysisSegmentRaw(analysis.id, id, ext);
	const segments = yield* Segments;
	const created = yield* segments.createPending({
		id,
		analysisId: analysis.id,
		startMs: body.startMs,
		endMs: body.endMs,
		sourceKey,
		annotationsAction: body.annotations ?? 'keep'
	});
	const put = yield* (yield* R2).presignPut({ key: sourceKey, contentType: body.contentType, sizeBytes: body.sizeBytes });
	return {
		segment: toSegmentDto(created),
		upload: { url: put.url, headers: put.headers, expiresAt: put.expiresAt.toISOString() },
		annotationsInRange: yield* segments.countAnnotationsIn(analysis.id, body.startMs, body.endMs)
	} satisfies CreateSegmentResponse;
});

/**
 * `POST /api/analyses/:id/segments/:segmentId/complete`: coach only. Check the recording is in R2 (HEAD), mark it
 * uploaded and queue `analysis.segment.uploaded`. Safe to repeat (the exclusive queue de-duplicates).
 */
export const completeSegment = Effect.gen(function* () {
	const coach = yield* requireRole('coach');
	const { analysis } = yield* viewableAnalysis(coach);
	const seg = yield* ownSegment(analysis.id);
	if (seg.status !== 'pending' && seg.status !== 'uploaded') return toSegmentDto(seg);
	if (!seg.sourceKey) return yield* new Conflict({ message: 'This recording has no file' });
	const head = yield* (yield* R2).head(seg.sourceKey);
	if (!head) return yield* new Conflict({ message: 'The upload has not finished. Try again.' });
	if (head.sizeBytes <= 0 || head.sizeBytes > MAX_SEGMENT_BYTES) return yield* new Conflict({ message: 'The uploaded file is not a valid size' });
	const updated = yield* (yield* Segments).markUploaded(seg.id);
	if (!updated) return toSegmentDto(seg);
	yield* (yield* Queue).send('analysis.segment.uploaded', { analysis_id: analysis.id, segment_id: seg.id });
	return toSegmentDto(updated);
});

/** `GET /api/analyses/:id/segments/:segmentId`: coach only; the recorder polls it until `ready` or `failed`. */
export const getSegment = Effect.gen(function* () {
	const coach = yield* requireRole('coach');
	const { analysis } = yield* viewableAnalysis(coach);
	return toSegmentDto(yield* ownSegment(analysis.id));
});

/** `POST /api/analyses/:id/segments/undo`: coach only. Reverse the latest re-record (within 30 days). */
export const undoSegments = Effect.gen(function* () {
	const coach = yield* requireRole('coach');
	const { analysis } = yield* viewableAnalysis(coach);
	const result = yield* (yield* Segments).undoLast(analysis.id, REPLACED_RETENTION_DAYS);
	if (result._tag === 'NothingToUndo') return yield* new Conflict({ message: 'There is nothing to undo' });
	if (result._tag === 'Expired') return yield* new Conflict({ message: 'That change is too old to undo' });
	return { restored: result.restored, restoredAnnotations: result.restoredAnnotations };
});

/**
 * `GET /api/analyses/:id/manifest`: the owner of the video, or a coach who may see it. The live segments in order, each
 * with a signed URL (1 h) for its clip, to play one after another alongside the video ("manifest-based playback").
 */
export const getManifest = Effect.gen(function* () {
	const user = yield* currentUser;
	const { analysis } = yield* viewableAnalysis(user);
	const r2 = yield* R2;
	const live = (yield* (yield* Segments).listLive(analysis.id)).filter((s) => s.clipKey);
	const signed = yield* Effect.forEach(live, (s) => r2.presignGet({ key: s.clipKey! }), { concurrency: 8 });
	const expires = signed.reduce<Date | undefined>((min, p) => (!min || p.expiresAt < min ? p.expiresAt : min), undefined);
	return {
		analysisId: analysis.id,
		videoId: analysis.videoId,
		segments: live.map((s, i) => ({ id: s.id, startMs: s.startMs, endMs: s.endMs, clipStartMs: s.clipStartMs, hasVideo: s.hasVideo, url: signed[i]!.url })),
		expiresAt: (expires ?? new Date()).toISOString()
	} satisfies ManifestResponse;
});

