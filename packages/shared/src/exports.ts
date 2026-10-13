/** Flattened analysis export (`analysis.assemble`, Could-Have): one MP4 with the video, annotations and the coach's commentary. */

export type ExportStatus = 'queued' | 'processing' | 'ready' | 'failed';

/** `POST /api/analyses/:id/export` (202) and `GET /api/analyses/:id/export`. */
export interface ExportDto {
	/** `none` until the coach has asked for one. */
	readonly status: ExportStatus | 'none';
	readonly requestedAt: string | null;
	readonly readyAt: string | null;
	readonly sizeBytes: number | null;
	/** Why it failed (`SOURCE_MISSING`, `TRANSCODE_FAILED`, ...); only with `failed`. */
	readonly errorCode: string | null;
	/** A presigned download, only when `ready`. */
	readonly download: { readonly url: string; readonly expiresAt: string; readonly filename: string } | null;
}

/** A request this old with no result is treated as lost (the job expires after 30 minutes and retries), so the coach can ask again. */
export const EXPORT_STALE_MINUTES = 60;
