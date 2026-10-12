import { Queue, Segments, Videos } from '@ttg/db';
import { MAX_VIDEO_BYTES, REPLACED_RETENTION_DAYS } from '@ttg/shared';
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

/** A recording that never finished (pending, failed or stuck) is dropped after this long. */
export const ABANDONED_SEGMENT_AFTER_SECONDS = 24 * 60 * 60;

export interface SegmentSweepResult {
	/** Rows deleted. */
	readonly rows: number;
	/** R2 objects deleted (a clip still used by a live trimmed piece is kept). */
	readonly objects: number;
	readonly skipped: number;
}

/**
 * Delete what the 30-day undo window no longer needs: segments replaced more than `REPLACED_RETENTION_DAYS` ago
 * (including ones undone then), and recordings that never finished. For each, its R2 objects (the raw recording and
 * the normalized clip) go first, unless another row still points at the same object (a trimmed piece shares its
 * parent's clip), then the row. A failure on one row is logged and left for the next night. Only `analysis/` keys
 * can be deleted (the Storage service refuses anything else), so source videos are never touched.
 */
export const sweepReplacedSegments = Effect.gen(function* () {
	const segments = yield* Segments;
	const storage = yield* Storage;
	const rows = yield* segments.listDeletable({ abandonedSeconds: ABANDONED_SEGMENT_AFTER_SECONDS, replacedDays: REPLACED_RETENTION_DAYS });
	let deleted = 0;
	let objects = 0;
	let skipped = 0;
	for (const row of rows) {
		const outcome = yield* Effect.gen(function* () {
			let removed = 0;
			for (const key of new Set([row.clipKey, row.sourceKey].filter((k): k is string => !!k))) {
				if (yield* segments.keyInUse(key, [row.id])) continue;
				yield* storage.deleteSegmentObject(key);
				removed++;
			}
			yield* segments.deleteRow(row.id);
			return removed;
		}).pipe(Effect.catchCause((cause) => Effect.logError(`segment sweep skipped ${row.id}`, cause).pipe(Effect.as(-1))));
		if (outcome < 0) skipped++;
		else {
			deleted++;
			objects += outcome;
		}
	}
	const result: SegmentSweepResult = { rows: deleted, objects, skipped };
	if (rows.length > 0) yield* Effect.logInfo(`replaced segments: ${JSON.stringify(result)}`);
	return result;
});
