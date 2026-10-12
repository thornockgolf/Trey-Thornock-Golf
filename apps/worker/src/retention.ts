import { Queue, Videos } from '@ttg/db';
import { MAX_VIDEO_BYTES } from '@ttg/shared';
import { Effect } from 'effect';
import { Storage } from './storage';

/** A `pending` video this old is an upload that was never completed (presigned PUTs last 15 minutes). */
export const ABANDONED_AFTER_SECONDS = 24 * 60 * 60;

export interface AbandonedUploadsResult {
	readonly deleted: number;
	readonly promoted: number;
	readonly failed: number;
	readonly skipped: number;
}

/**
 * Clean up videos stuck in `pending`:
 * - the source object is in R2 (the browser finished but never called `/complete`): the owner meant to upload
 *   it, so mark it `uploaded` and queue `video.uploaded`;
 * - an empty or oversize object: mark the row `failed` (`INVALID_UPLOAD`); nothing is deleted;
 * - no object: delete the row (nothing in R2 refers to it).
 * A row whose R2 check fails is skipped and tried again on the next run. Incomplete multipart parts are not
 * handled here; an R2 lifecycle rule ("abort incomplete multipart uploads after 1 day") frees them.
 */
export const sweepAbandonedUploads = Effect.gen(function* () {
	const videos = yield* Videos;
	const storage = yield* Storage;
	const queue = yield* Queue;
	const rows = yield* videos.listAbandonedPending(ABANDONED_AFTER_SECONDS);
	let deleted = 0;
	let promoted = 0;
	let failed = 0;
	let skipped = 0;
	for (const v of rows) {
		const outcome = yield* Effect.gen(function* () {
			const head = v.sourceKey ? yield* storage.head(v.sourceKey) : undefined;
			if (head && head.sizeBytes > 0 && head.sizeBytes <= MAX_VIDEO_BYTES) {
				const up = yield* videos.markUploaded(v.id, head.sizeBytes);
				if (up) yield* queue.send('video.uploaded', { video_id: v.id });
				return 'promoted' as const;
			}
			if (head) {
				// an empty or oversize object is not a usable upload; keep the row (and the object) and mark it failed
				yield* videos.markFailed(v.id, 'INVALID_UPLOAD');
				return 'failed' as const;
			}
			return (yield* videos.deletePending(v.id)) ? ('deleted' as const) : ('skipped' as const);
		}).pipe(
			Effect.catchCause((cause) => Effect.logError(`abandoned-upload sweep skipped ${v.id}`, cause).pipe(Effect.as('skipped' as const)))
		);
		if (outcome === 'deleted') deleted++;
		else if (outcome === 'promoted') promoted++;
		else if (outcome === 'failed') failed++;
		else skipped++;
	}
	const result: AbandonedUploadsResult = { deleted, promoted, failed, skipped };
	if (rows.length > 0) yield* Effect.logInfo(`abandoned uploads: ${JSON.stringify(result)}`);
	return result;
});
