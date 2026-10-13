import { Queue, Videos, type Video } from '@ttg/db';
import {
	MAX_VIDEO_BYTES,
	PART_SIZE_BYTES,
	VIDEO_TYPES,
	VideoUploadRequest,
	needsMultipart,
	keys,
	DownloadVariant,
	type CreateVideoResponse,
	type CurrentUserData,
	type DownloadResponse,
	type PlaybackResponse,
	type UploadPlan,
	type VideoDto,
	type VideoExtension
} from '@ttg/shared';
import { Effect, Schema } from 'effect';
import { currentUser, requireRole } from './auth';
import { decodeBody } from './decode';
import { requireAssessment } from './entitlements';
import { Conflict, Forbidden, NotFound, ValidationError } from './errors';
import { R2 } from './r2';
import { RequestContext } from './request-context';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** The `:id` route param, as a UUID. Anything else is a 404 (nothing can exist under it). */
export const videoIdParam = Effect.gen(function* () {
	const { event } = yield* RequestContext;
	const id = event.params.id ?? '';
	if (!UUID.test(id)) return yield* new NotFound({ message: 'Video not found' });
	return id;
});

const extOf = (video: Video): VideoExtension => {
	const ext = video.sourceKey?.split('.').pop();
	return (Object.values(VIDEO_TYPES) as string[]).includes(ext ?? '') ? (ext as VideoExtension) : 'mp4';
};

/** Signed poster URL for a ready video; null otherwise. */
export const posterUrl = (video: Video) =>
	Effect.gen(function* () {
		if (video.status !== 'ready' || !video.thumbnailKey) return null;
		return (yield* (yield* R2).presignGet({ key: video.thumbnailKey })).url;
	});

export const toDto = (video: Video, poster: string | null = null): VideoDto => ({
	id: video.id,
	kind: video.kind,
	status: video.status,
	title: video.title,
	errorCode: video.errorCode,
	durationMs: video.durationMs,
	fps: video.fps,
	width: video.width,
	height: video.height,
	sizeBytes: video.sizeBytes,
	createdAt: video.createdAt.toISOString(),
	posterUrl: poster
});

/** Owner only: loads the video and fails 404 (missing) or 403 (someone else's). Uploads never go through a coach. */
export const ownedVideo = (id: string, user: CurrentUserData) =>
	Effect.gen(function* () {
		const video = yield* (yield* Videos).find(id);
		if (!video) return yield* new NotFound({ message: 'Video not found' });
		if (video.ownerId !== user.id) return yield* new Forbidden({ message: 'Not allowed' });
		return video;
	});

/**
 * Owner, or a coach with an active assignment to the owner. Anyone else gets 403 and no URL. Reference videos
 * (the coach's pro library) are the exception: any signed-in user may view them.
 */
export const viewableVideo = (id: string, user: CurrentUserData) =>
	Effect.gen(function* () {
		const videos = yield* Videos;
		const video = yield* videos.find(id);
		if (!video) return yield* new NotFound({ message: 'Video not found' });
		if (video.ownerId === user.id || video.kind === 'reference') return video;
		if (user.role === 'coach' && (yield* videos.isAssignedCoach(user.id, video.ownerId))) return video;
		return yield* new Forbidden({ message: 'Not allowed' });
	});

const sourceKeyOf = (video: Video) =>
	video.sourceKey ? Effect.succeed(video.sourceKey) : Effect.fail(new Conflict({ message: 'Video has no source' }));

/** `POST /api/videos`: validate, create the row, issue a presigned PUT (small) or start a multipart upload (large). */
export const createVideo = Effect.gen(function* () {
	const body = yield* decodeBody(VideoUploadRequest);
	const kind = body.kind ?? 'swing';
	// reference clips are the coach's library: coach only, and they need a name to be found by
	const user = kind === 'reference' ? yield* requireRole('coach') : yield* currentUser;
	// players pay for the assessment before they can upload swings (spec 3.E.2)
	if (kind === 'swing') yield* requireAssessment(user);
	if (kind === 'reference' && !body.title?.trim()) return yield* new ValidationError({ message: 'Invalid request: check title' });
	const videos = yield* Videos;
	const r2 = yield* R2;
	const id = crypto.randomUUID();
	const ext = VIDEO_TYPES[body.contentType];
	const key = keys.rawSource(id, ext);
	const video = yield* videos.create({
		id,
		ownerId: user.id,
		kind,
		sourceKey: key,
		sizeBytes: body.sizeBytes,
		title: body.title?.trim() || null
	});
	if (needsMultipart(body.sizeBytes)) {
		const { uploadId } = yield* r2.createMultipart({ key, contentType: body.contentType });
		return { video: toDto(video), upload: { mode: 'multipart', uploadId, partSizeBytes: PART_SIZE_BYTES } } satisfies CreateVideoResponse;
	}
	const put = yield* r2.presignPut({ key, contentType: body.contentType, sizeBytes: body.sizeBytes });
	return {
		video: toDto(video),
		upload: { mode: 'single', url: put.url, headers: put.headers, expiresAt: put.expiresAt.toISOString() }
	} satisfies CreateVideoResponse;
});

/** Multipart calls only act on a video the caller owns that is still waiting for its bytes. */
const pendingOwned = (user: CurrentUserData) =>
	Effect.gen(function* () {
		const video = yield* ownedVideo(yield* videoIdParam, user);
		if (video.status !== 'pending') return yield* new Conflict({ message: 'This video was already uploaded' });
		return { video, key: yield* sourceKeyOf(video) };
	});

const contentTypeOf = (ext: VideoExtension) => (Object.entries(VIDEO_TYPES).find(([, e]) => e === ext)?.[0] ?? 'video/mp4') as keyof typeof VIDEO_TYPES;

/**
 * `POST /api/videos/:id/upload-url`: a fresh presigned PUT for a video that is still `pending` and uses the
 * single-request upload, so a retry after the 15 min URL expired does not need a new video row.
 */
export const reissueUpload = Effect.gen(function* () {
	const { video, key } = yield* pendingOwned(yield* currentUser);
	const size = video.sizeBytes ?? 0;
	if (size <= 0 || needsMultipart(size)) return yield* new Conflict({ message: 'This upload does not use a single request' });
	const put = yield* (yield* R2).presignPut({ key, contentType: contentTypeOf(extOf(video)), sizeBytes: size });
	return { mode: 'single', url: put.url, headers: put.headers, expiresAt: put.expiresAt.toISOString() } satisfies UploadPlan;
});

export const signPart = (body: { uploadId: string; partNumber: number }) =>
	Effect.gen(function* () {
		const { key } = yield* pendingOwned(yield* currentUser);
		const r2 = yield* R2;
		const signed = yield* r2.presignPart({ key, uploadId: body.uploadId, partNumber: body.partNumber });
		return { url: signed.url, expiresAt: signed.expiresAt.toISOString() };
	});

export const listParts = Effect.gen(function* () {
		const uploadId = (yield* RequestContext).event.url.searchParams.get('uploadId') ?? '';
		if (!uploadId) return yield* new ValidationError({ message: 'uploadId is required' });
		const { key } = yield* pendingOwned(yield* currentUser);
		const parts = yield* (yield* R2).listParts({ key, uploadId });
		return { parts };
	});

export const completeMultipart = (body: { uploadId: string; parts: readonly { partNumber: number; etag: string }[] }) =>
	Effect.gen(function* () {
		const { key } = yield* pendingOwned(yield* currentUser);
		yield* (yield* R2).completeMultipart({ key, uploadId: body.uploadId, parts: body.parts });
		return { ok: true };
	});

export const abortMultipart = (uploadId: string) =>
	Effect.gen(function* () {
		if (!uploadId) return yield* new ValidationError({ message: 'uploadId is required' });
		const { key } = yield* pendingOwned(yield* currentUser);
		yield* (yield* R2).abortMultipart({ key, uploadId });
		return { ok: true };
	});

/**
 * `POST /api/videos/:id/complete`: confirm the object really is in R2 (HEAD), mark `uploaded`, enqueue
 * `video.uploaded`. Safe to repeat: a video already past `uploaded` is returned unchanged and nothing is queued;
 * a repeat while still `uploaded` re-sends, which the exclusive queue de-duplicates (and recovers a lost enqueue).
 */
export const completeVideo = Effect.gen(function* () {
	const user = yield* currentUser;
	const videos = yield* Videos;
	const video = yield* ownedVideo(yield* videoIdParam, user);
	if (video.status !== 'pending' && video.status !== 'uploaded') return toDto(video);
	const key = yield* sourceKeyOf(video);
	const head = yield* (yield* R2).head(key);
	if (!head) return yield* new Conflict({ message: 'The upload has not finished. Try again.' });
	if (head.sizeBytes <= 0 || head.sizeBytes > MAX_VIDEO_BYTES) {
		return yield* new Conflict({ message: 'The uploaded file is not a valid size' });
	}
	const updated = yield* videos.markUploaded(video.id, head.sizeBytes);
	if (!updated) return toDto((yield* videos.find(video.id)) ?? video);
	yield* (yield* Queue).send('video.uploaded', { video_id: video.id });
	return toDto(updated);
});

/** `GET /api/videos` for the signed-in user: their videos, with signed poster URLs for ready ones. */
export const listMyVideos = Effect.gen(function* () {
	const user = yield* currentUser;
	const rows = yield* (yield* Videos).listByOwner(user.id);
	const dtos = yield* Effect.forEach(rows, (v) => posterUrl(v).pipe(Effect.map((p) => toDto(v, p))), { concurrency: 8 });
	return { videos: dtos };
});

const readyVideo = (id: string, user: CurrentUserData) =>
	Effect.gen(function* () {
		const video = yield* viewableVideo(id, user);
		if (video.status !== 'ready') return yield* new Conflict({ message: 'This video is not ready yet' });
		return video;
	});

const playbackFor = (video: Video) =>
	Effect.gen(function* () {
		const r2 = yield* R2;
		const get = (key: string | null) => (key ? r2.presignGet({ key }) : Effect.succeed(undefined));
		const [main, poster, sprite, vtt] = yield* Effect.all(
			[get(video.processedKey), get(video.thumbnailKey), get(video.spriteKey), get(video.spriteKey ? keys.spriteVtt(video.id) : null)],
			{ concurrency: 4 }
		);
		if (!main) return yield* new Conflict({ message: 'This video is not ready yet' });
		return {
			video: toDto(video, poster?.url ?? null),
			url: main.url,
			expiresAt: main.expiresAt.toISOString(),
			spriteUrl: sprite?.url ?? null,
			spriteVttUrl: vtt?.url ?? null
		} satisfies PlaybackResponse;
	});

/** `GET /api/videos/:id/playback`: signed GET (1 h) for the processed file, after the access check. */
export const playbackVideo = Effect.gen(function* () {
	const user = yield* currentUser;
	return yield* playbackFor(yield* readyVideo(yield* videoIdParam, user));
});

/**
 * Data for the video page (`/videos/:id`): the video for anyone allowed to view it, plus signed playback URLs once
 * it is `ready`. Same access check as the API (owner or assigned coach, 403 otherwise).
 */
export const videoDetail = Effect.gen(function* () {
	const user = yield* currentUser;
	const video = yield* viewableVideo(yield* videoIdParam, user);
	if (video.status !== 'ready') return { video: toDto(video), playback: null };
	return { video: toDto(video), playback: yield* playbackFor(video) };
});

/** `GET /api/videos/:id/download?variant=processed|original`: signed GET with `Content-Disposition: attachment`. */
export const downloadVideo = Effect.gen(function* () {
	const user = yield* currentUser;
	const { event } = yield* RequestContext;
	const variant = yield* Schema.decodeUnknownEffect(DownloadVariant)(event.url.searchParams.get('variant') ?? 'processed').pipe(
		Effect.mapError(() => new ValidationError({ message: 'variant must be "processed" or "original"' }))
	);
	const video = yield* readyVideo(yield* videoIdParam, user);
	// the original upload of a reference clip stays with the coach (licensed footage later)
	if (variant === 'original' && video.kind === 'reference' && video.ownerId !== user.id) {
		return yield* new Forbidden({ message: 'Not allowed' });
	}
	const base = (video.title?.trim() || `swing-${video.createdAt.toISOString().slice(0, 10)}`).slice(0, 80);
	const original = variant === 'original';
	const key = original ? video.sourceKey : video.processedKey;
	if (!key) return yield* new Conflict({ message: 'That file is not available' });
	const filename = original ? `${base}-original.${extOf(video)}` : `${base}.mp4`;
	const signed = yield* (yield* R2).presignGet({ key, downloadName: filename });
	return { url: signed.url, expiresAt: signed.expiresAt.toISOString(), filename } satisfies DownloadResponse;
});


/**
 * `GET /api/references`: the reference library with signed poster URLs. Players and coaches see ready clips; the
 * coach also sees ones still processing or failed so they can tell an upload went through.
 */
export const listReferences = Effect.gen(function* () {
	const user = yield* currentUser;
	const rows = yield* (yield* Videos).listReferences({ readyOnly: user.role !== 'coach' });
	const dtos = yield* Effect.forEach(rows, (v) => posterUrl(v).pipe(Effect.map((p) => toDto(v, p))), { concurrency: 8 });
	return { videos: dtos };
});
