import { Schema } from 'effect';
import { PartNumber } from './storage';

/** Multipart upload ids come from R2; the app never trusts them for anything but passing back to R2. */
const UploadId = Schema.String.pipe(Schema.check(Schema.isMinLength(1), Schema.isMaxLength(1024)));

export const SignPartRequest = Schema.Struct({ uploadId: UploadId, partNumber: PartNumber });
export type SignPartRequest = typeof SignPartRequest.Type;

export const CompleteMultipartRequest = Schema.Struct({
	uploadId: UploadId,
	parts: Schema.Array(
		Schema.Struct({ partNumber: PartNumber, etag: Schema.String.pipe(Schema.check(Schema.isMinLength(1), Schema.isMaxLength(256))) })
	).pipe(Schema.check(Schema.isMinLength(1), Schema.isMaxLength(10_000)))
});
export type CompleteMultipartRequest = typeof CompleteMultipartRequest.Type;

export const AbortMultipartRequest = Schema.Struct({ uploadId: UploadId });
export type AbortMultipartRequest = typeof AbortMultipartRequest.Type;

export const DownloadVariant = Schema.Literals(['processed', 'original']);
export type DownloadVariant = typeof DownloadVariant.Type;

export type VideoStatus = 'pending' | 'uploaded' | 'processing' | 'ready' | 'failed';

/** A video as the API returns it. No storage keys; poster URLs are short-lived signed URLs. */
export interface VideoDto {
	readonly id: string;
	readonly kind: 'swing' | 'reference' | 'analysis_source';
	readonly status: VideoStatus;
	readonly title: string | null;
	/** Machine code when status is `failed` (never raw ffmpeg output). */
	readonly errorCode: string | null;
	readonly durationMs: number | null;
	readonly fps: number | null;
	readonly width: number | null;
	readonly height: number | null;
	readonly sizeBytes: number | null;
	readonly createdAt: string;
	readonly posterUrl: string | null;
}

export type UploadPlan =
	| {
			readonly mode: 'single';
			readonly url: string;
			/** The browser must send exactly these headers. */
			readonly headers: Readonly<Record<string, string>>;
			readonly expiresAt: string;
	  }
	| { readonly mode: 'multipart'; readonly uploadId: string; readonly partSizeBytes: number };

/** Response of `POST /api/videos`. */
export interface CreateVideoResponse {
	readonly video: VideoDto;
	readonly upload: UploadPlan;
}

/** Response of `GET /api/videos/:id/playback`. */
export interface PlaybackResponse {
	readonly video: VideoDto;
	readonly url: string;
	readonly expiresAt: string;
	readonly spriteUrl: string | null;
	readonly spriteVttUrl: string | null;
}

export interface DownloadResponse {
	readonly url: string;
	readonly expiresAt: string;
	readonly filename: string;
}
