import { Schema } from 'effect';
import { Uuid } from './analyses';

/** Recording limits for analysis segments (spec 3.D.3). */
export const MAX_SEGMENT_BYTES = 100 * 1024 * 1024;
export const MIN_SEGMENT_MS = 500;
export const MAX_SEGMENT_MS = 15 * 60 * 1000;
/** Replaced segments (and the old files) stay this long so the coach can undo. */
export const REPLACED_RETENTION_DAYS = 30;

/**
 * What MediaRecorder produces, by browser: WebM (Chrome, Firefox, Edge), MP4 (Safari), Ogg (some Firefox builds).
 * Audio-only recordings (microphone without camera) are accepted. The worker turns every recording into MP4/AAC.
 */
export const SEGMENT_TYPES = {
	'video/webm': 'webm',
	'audio/webm': 'webm',
	'video/mp4': 'mp4',
	'audio/mp4': 'mp4',
	'audio/ogg': 'ogg'
} as const;
export type SegmentContentType = keyof typeof SEGMENT_TYPES;
export type SegmentExtension = (typeof SEGMENT_TYPES)[SegmentContentType];

const Ms = Schema.Number.pipe(Schema.check(Schema.isInt(), Schema.isBetween({ minimum: 0, maximum: 24 * 3_600_000 })));

/** Record (or re-record) the range `startMs`..`endMs` of the analysis timeline. */
export const CreateSegmentRequest = Schema.Struct({
	startMs: Ms,
	endMs: Ms,
	contentType: Schema.Literals(Object.keys(SEGMENT_TYPES) as [SegmentContentType, ...SegmentContentType[]]),
	sizeBytes: Schema.Number.pipe(Schema.check(Schema.isInt(), Schema.isBetween({ minimum: 1, maximum: MAX_SEGMENT_BYTES }))),
	/** What to do with annotations that start inside the range when the new recording goes live. Default keep. */
	annotations: Schema.optional(Schema.Literals(['keep', 'remove']))
});
export type CreateSegmentRequest = typeof CreateSegmentRequest.Type;

export type SegmentStatus = 'pending' | 'uploaded' | 'processing' | 'ready' | 'failed';

export interface SegmentDto {
	readonly id: string;
	readonly startMs: number;
	readonly endMs: number;
	readonly status: SegmentStatus;
	readonly errorCode: string | null;
	readonly createdAt: string;
}

/** `POST /api/analyses/:id/segments`. */
export interface CreateSegmentResponse {
	readonly segment: SegmentDto;
	readonly upload: { readonly url: string; readonly headers: Readonly<Record<string, string>>; readonly expiresAt: string };
	/** Annotations that start inside the range, so the coach can be asked to keep or remove them. */
	readonly annotationsInRange: number;
}

/** One playable piece of the analysis: play `clipStartMs` onwards of the clip for `endMs - startMs`. */
export interface ManifestSegment {
	readonly id: string;
	readonly startMs: number;
	readonly endMs: number;
	readonly clipStartMs: number;
	readonly hasVideo: boolean;
	readonly url: string;
}

/** `GET /api/analyses/:id/manifest`: what the player plays, in order, alongside the base video. */
export interface ManifestResponse {
	readonly analysisId: string;
	readonly videoId: string;
	readonly segments: readonly ManifestSegment[];
	readonly expiresAt: string;
}

export const SegmentIdParam = Uuid;

// ---------------------------------------------------------------------------------------------
// Timeline rules (pure, shared by the database commit and its tests)

export interface TimelineSegment {
	readonly id: string;
	readonly startMs: number;
	readonly endMs: number;
	/** Where in its clip this segment starts playing. */
	readonly clipStartMs: number;
}

export interface TrimPlan {
	/** The live segment this piece is cut from. */
	readonly from: string;
	readonly startMs: number;
	readonly endMs: number;
	readonly clipStartMs: number;
}

/** A segment overlaps a range when they share time (touching at an end does not count). */
export const overlaps = (seg: { startMs: number; endMs: number }, startMs: number, endMs: number) => seg.startMs < endMs && seg.endMs > startMs;

/**
 * Re-recording `startMs`..`endMs`: every live segment that overlaps it is replaced; the parts of those segments that
 * fall outside the range stay, as trimmed pieces of the same clip (same file, different slice). Segments that do not
 * overlap are untouched.
 */
export const planReplace = (live: readonly TimelineSegment[], startMs: number, endMs: number) => {
	const replaced: string[] = [];
	const trims: TrimPlan[] = [];
	for (const seg of live) {
		if (!overlaps(seg, startMs, endMs)) continue;
		replaced.push(seg.id);
		if (seg.startMs < startMs) trims.push({ from: seg.id, startMs: seg.startMs, endMs: startMs, clipStartMs: seg.clipStartMs });
		if (seg.endMs > endMs) trims.push({ from: seg.id, startMs: endMs, endMs: seg.endMs, clipStartMs: seg.clipStartMs + (endMs - seg.startMs) });
	}
	return { replaced, trims };
};
