import { Annotations, type Annotation, type Video } from '@ttg/db';
import {
	CreateAnnotationRequest,
	MAX_ANNOTATIONS_PER_VIDEO,
	MAX_ANNOTATION_BYTES,
	UpdateAnnotationRequest,
	shapeBytes,
	type AnnotationDto
} from '@ttg/shared';
import { Effect } from 'effect';
import { currentUser, requireRole } from './auth';
import { decodeBody } from './decode';
import { Conflict, NotFound, ValidationError } from './errors';
import { RequestContext } from './request-context';
import { videoIdParam, viewableVideo } from './videos';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export const toAnnotationDto = (a: Annotation): AnnotationDto => ({
	id: a.id,
	videoId: a.videoId,
	authorId: a.authorId,
	startMs: a.startMs,
	endMs: a.endMs,
	shape: a.shape,
	version: a.version,
	createdAt: a.createdAt.toISOString(),
	updatedAt: a.updatedAt.toISOString()
});

const annotationIdParam = Effect.gen(function* () {
	const { event } = yield* RequestContext;
	const id = event.params.annotationId ?? '';
	if (!UUID.test(id)) return yield* new NotFound({ message: 'Annotation not found' });
	return id;
});

const checkShapeSize = (shape: unknown) =>
	shapeBytes(shape) > MAX_ANNOTATION_BYTES
		? Effect.fail(new ValidationError({ message: 'This annotation is too large. Simplify the drawing.' }))
		: Effect.void;

/** A range must start before it ends and lie on the video's timeline. */
const checkRange = (video: Video, startMs: number, endMs: number) => {
	if (startMs > endMs) return Effect.fail(new ValidationError({ message: 'Invalid request: check startMs, endMs' }));
	if (video.durationMs === null) return Effect.fail(new Conflict({ message: 'This video is not ready yet' }));
	if (endMs > video.durationMs) return Effect.fail(new ValidationError({ message: 'Invalid request: check startMs, endMs' }));
	return Effect.void;
};

/** `GET /api/videos/:id/annotations`: the video's owner or an assigned coach. */
export const listAnnotations = Effect.gen(function* () {
	const user = yield* currentUser;
	const video = yield* viewableVideo(yield* videoIdParam, user);
	const rows = yield* (yield* Annotations).listByVideo(video.id);
	return { annotations: rows.map(toAnnotationDto) };
});

/** `POST /api/videos/:id/annotations`: coach only. */
export const createAnnotation = Effect.gen(function* () {
	const coach = yield* requireRole('coach');
	const body = yield* decodeBody(CreateAnnotationRequest);
	const video = yield* viewableVideo(yield* videoIdParam, coach);
	yield* checkRange(video, body.startMs, body.endMs);
	yield* checkShapeSize(body.shape);
	const annotations = yield* Annotations;
	if ((yield* annotations.countByVideo(video.id)) >= MAX_ANNOTATIONS_PER_VIDEO) {
		return yield* new ValidationError({ message: `A video can have at most ${MAX_ANNOTATIONS_PER_VIDEO} annotations` });
	}
	const created = yield* annotations.create({
		videoId: video.id,
		authorId: coach.id,
		startMs: body.startMs,
		endMs: body.endMs,
		shape: body.shape
	});
	return toAnnotationDto(created);
});

/** `PATCH /api/videos/:id/annotations/:annotationId`: coach only; a stale `version` is a 409 (reload and retry). */
export const updateAnnotation = Effect.gen(function* () {
	const coach = yield* requireRole('coach');
	const body = yield* decodeBody(UpdateAnnotationRequest);
	const video = yield* viewableVideo(yield* videoIdParam, coach);
	const id = yield* annotationIdParam;
	const annotations = yield* Annotations;
	const current = (yield* annotations.listByVideo(video.id)).find((a) => a.id === id);
	if (!current) return yield* new NotFound({ message: 'Annotation not found' });
	yield* checkRange(video, body.startMs ?? current.startMs, body.endMs ?? current.endMs);
	if (body.shape) yield* checkShapeSize(body.shape);
	const result = yield* annotations.update({
		id,
		videoId: video.id,
		version: body.version,
		startMs: body.startMs,
		endMs: body.endMs,
		shape: body.shape
	});
	if (result._tag === 'Missing') return yield* new NotFound({ message: 'Annotation not found' });
	if (result._tag === 'Stale') return yield* new Conflict({ message: 'Someone else changed this annotation. Reload to see the latest.' });
	return toAnnotationDto(result.annotation);
});

/** `DELETE /api/videos/:id/annotations/:annotationId[?version=n]`: coach only. */
export const deleteAnnotation = Effect.gen(function* () {
	const coach = yield* requireRole('coach');
	const video = yield* viewableVideo(yield* videoIdParam, coach);
	const id = yield* annotationIdParam;
	const { event } = yield* RequestContext;
	const raw = event.url.searchParams.get('version');
	const version = raw === null ? undefined : Number(raw);
	if (version !== undefined && (!Number.isInteger(version) || version < 1)) {
		return yield* new ValidationError({ message: 'Invalid request: check version' });
	}
	const result = yield* (yield* Annotations).remove({ id, videoId: video.id, version });
	if (result._tag === 'Missing') return yield* new NotFound({ message: 'Annotation not found' });
	if (result._tag === 'Stale') return yield* new Conflict({ message: 'Someone else changed this annotation. Reload to see the latest.' });
	return { ok: true };
});
