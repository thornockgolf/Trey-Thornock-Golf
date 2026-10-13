import { Schema } from 'effect';

/** Upload limits (spec 3.C.1). Configurable constants, kept in one place for app, worker and UI. */
export const MAX_VIDEO_BYTES = 500 * 1024 * 1024;
export const MAX_VIDEO_MS = 5 * 60 * 1000;

/** MIME type -> file extension for accepted video uploads. */
export const VIDEO_TYPES = { 'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm' } as const;
export type VideoContentType = keyof typeof VIDEO_TYPES;
export type VideoExtension = (typeof VIDEO_TYPES)[VideoContentType];

/** Files at or above this size use multipart upload; each part (except the last) is PART_SIZE_BYTES. */
export const MULTIPART_THRESHOLD_BYTES = 50 * 1024 * 1024;
export const PART_SIZE_BYTES = 10 * 1024 * 1024;
/** S3/R2 limit on part numbers. */
export const MAX_PART_NUMBER = 10_000;

/** Presigned URL lifetimes in seconds (spec section 7): upload 15 min, read 1 h. */
export const PRESIGN_PUT_TTL_S = 15 * 60;
export const PRESIGN_GET_TTL_S = 60 * 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp'] as const;

const id = (kind: string, value: string): string => {
	// Keys are built server-side from our own ids; refuse anything that could change the path.
	if (!UUID.test(value)) throw new Error(`Invalid ${kind} id for an object key`);
	return value;
};

/** Object key layout (spec section 4, "Object Storage (R2) Layout"). Every id must be a UUID. */
export const keys = {
	rawSource: (videoId: string, ext: VideoExtension) => {
		if (!Object.values(VIDEO_TYPES).includes(ext)) throw new Error('Invalid video extension');
		return `raw/${id('video', videoId)}/source.${ext}`;
	},
	processedVideo: (videoId: string) => `processed/${id('video', videoId)}/video.mp4`,
	poster: (videoId: string) => `processed/${id('video', videoId)}/poster.jpg`,
	sprite: (videoId: string) => `processed/${id('video', videoId)}/sprite.jpg`,
	spriteVtt: (videoId: string) => `processed/${id('video', videoId)}/sprite.vtt`,
	/** The browser's raw recording of a segment (kept with the segment until the retention sweep removes it). */
	analysisSegmentRaw: (analysisId: string, segmentId: string, ext: 'webm' | 'mp4' | 'ogg') => {
		if (!['webm', 'mp4', 'ogg'].includes(ext)) throw new Error('Invalid recording extension');
		return `analysis/${id('analysis', analysisId)}/${id('segment', segmentId)}.raw.${ext}`;
	},
	analysisSegment: (analysisId: string, segmentId: string) =>
		`analysis/${id('analysis', analysisId)}/${id('segment', segmentId)}.mp4`,
	/** The flattened export of an analysis (`analysis.assemble`); rewritten on every export. */
	analysisExport: (analysisId: string) => `analysis/${id('analysis', analysisId)}/export.mp4`,
	profilePhoto: (userId: string, ext: (typeof IMAGE_EXTENSIONS)[number]) => {
		if (!IMAGE_EXTENSIONS.includes(ext)) throw new Error('Invalid image extension');
		return `profile/${id('user', userId)}/photo.${ext}`;
	}
} as const;

/** Body of a request to start a video upload. Rejects non-video types and oversize files (422). */
export const VideoUploadRequest = Schema.Struct({
	contentType: Schema.Literals(Object.keys(VIDEO_TYPES) as [VideoContentType, ...VideoContentType[]]),
	sizeBytes: Schema.Number.pipe(Schema.check(Schema.isInt(), Schema.isBetween({ minimum: 1, maximum: MAX_VIDEO_BYTES }))),
	title: Schema.optional(Schema.String.pipe(Schema.check(Schema.isMaxLength(120)))),
	/** `reference` (a coach's pro/reference clip, coach only, title required) or the default `swing`. */
	kind: Schema.optional(Schema.Literals(['swing', 'reference']))
});
export type VideoUploadRequest = typeof VideoUploadRequest.Type;

export const PartNumber = Schema.Number.pipe(Schema.check(Schema.isInt(), Schema.isBetween({ minimum: 1, maximum: MAX_PART_NUMBER })));

/** True when a file of this size should use multipart upload. */
export const needsMultipart = (sizeBytes: number) => sizeBytes >= MULTIPART_THRESHOLD_BYTES;
