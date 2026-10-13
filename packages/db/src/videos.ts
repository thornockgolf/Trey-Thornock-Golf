import { Context, Effect, Layer } from 'effect';
import { Db } from './db';
import { insertNotification, type Notification } from './notifications';
import type { DatabaseError } from './errors';

export type VideoKind = 'swing' | 'reference' | 'analysis_source';
export type VideoStatus = 'pending' | 'uploaded' | 'processing' | 'ready' | 'failed';

export interface Video {
	readonly id: string;
	readonly ownerId: string;
	readonly kind: VideoKind;
	readonly status: VideoStatus;
	readonly title: string | null;
	readonly sourceKey: string | null;
	readonly processedKey: string | null;
	readonly thumbnailKey: string | null;
	readonly spriteKey: string | null;
	readonly durationMs: number | null;
	readonly fps: number | null;
	readonly width: number | null;
	readonly height: number | null;
	readonly errorCode: string | null;
	readonly sizeBytes: number | null;
	readonly createdAt: Date;
}

/** What the worker learns while processing; written together with `status = 'ready'`. */
export interface ProcessedVideo {
	readonly processedKey: string;
	readonly thumbnailKey: string;
	readonly spriteKey: string;
	readonly durationMs: number;
	readonly fps: number;
	readonly width: number;
	readonly height: number;
}

interface VideoRow {
	id: string;
	owner_id: string;
	kind: VideoKind;
	status: VideoStatus;
	title: string | null;
	source_key: string | null;
	processed_key: string | null;
	thumbnail_key: string | null;
	sprite_key: string | null;
	duration_ms: number | null;
	fps: string | null; // numeric
	width: number | null;
	height: number | null;
	error_code: string | null;
	size_bytes: string | null; // bigint
	created_at: Date;
}

const COLUMNS =
	'id, owner_id, kind, status, title, source_key, processed_key, thumbnail_key, sprite_key, duration_ms, fps, width, height, error_code, size_bytes, created_at';

const num = (v: string | null) => (v === null ? null : Number(v));

const toVideo = (r: VideoRow): Video => ({
	id: r.id,
	ownerId: r.owner_id,
	kind: r.kind,
	status: r.status,
	title: r.title,
	sourceKey: r.source_key,
	processedKey: r.processed_key,
	thumbnailKey: r.thumbnail_key,
	spriteKey: r.sprite_key,
	durationMs: r.duration_ms,
	fps: num(r.fps),
	width: r.width,
	height: r.height,
	errorCode: r.error_code,
	sizeBytes: num(r.size_bytes),
	createdAt: r.created_at
});

export class Videos extends Context.Service<
	Videos,
	{
		/** New row in status `pending`. The id is chosen by the caller because the R2 key contains it. */
		readonly create: (input: {
			id: string;
			ownerId: string;
			kind: VideoKind;
			sourceKey: string;
			sizeBytes: number;
			title?: string | null;
		}) => Effect.Effect<Video, DatabaseError>;
		readonly find: (id: string) => Effect.Effect<Video | undefined, DatabaseError>;
		/** Reference videos (kind `reference`), newest first. `readyOnly` hides ones still processing or failed. */
		readonly listReferences: (opts: { readyOnly: boolean; limit?: number }) => Effect.Effect<readonly Video[], DatabaseError>;
		/** The owner's own videos (not the reference library), newest first. */
		readonly listByOwner: (ownerId: string, limit?: number) => Effect.Effect<readonly Video[], DatabaseError>;
		/**
		 * `pending` or `uploaded` -> `uploaded` with the verified size. Returns undefined when the video is
		 * already further along (processing, ready, failed), so a repeated `/complete` changes nothing.
		 */
		readonly markUploaded: (id: string, sizeBytes: number) => Effect.Effect<Video | undefined, DatabaseError>;
		/** Worker: `uploaded` or `processing` (a retry) -> `processing`. Undefined if there is nothing to process. */
		readonly claimForProcessing: (id: string) => Effect.Effect<Video | undefined, DatabaseError>;
		/**
		 * Worker: store the outputs and set `ready`; clears any earlier error code. Writes a `video_ready` notification for
		 * the owner the first time the video becomes ready and returns it (undefined on a repeat), so the caller can push it.
		 */
		readonly markReady: (id: string, out: ProcessedVideo) => Effect.Effect<Notification | undefined, DatabaseError>;
		/** Worker: set `failed` with a short machine-readable code, and write `video_failed` for the owner (once). */
		readonly markFailed: (id: string, errorCode: string) => Effect.Effect<Notification | undefined, DatabaseError>;
		/**
		 * Set `failed` (`PROCESSING_STALLED`) on videos stuck in `processing` for over `graceSeconds` that have no
		 * queued, retrying or active `video.uploaded` job: the job is gone (for example the worker died during the
		 * last attempt), so nothing will ever finish them. Returns the ids it failed.
		 */
		readonly failStalled: (graceSeconds: number) => Effect.Effect<readonly string[], DatabaseError>;
		/** `pending` videos created more than `olderThanSeconds` ago (the upload was never completed), oldest first. */
		readonly listAbandonedPending: (olderThanSeconds: number, limit?: number) => Effect.Effect<readonly Video[], DatabaseError>;
		/** Delete a row that is still `pending`. Returns whether it was deleted. Rows past `pending` are never touched. */
		readonly deletePending: (id: string) => Effect.Effect<boolean, DatabaseError>;
		/** True when `coachId` has an active assignment to `playerId`. */
		readonly isAssignedCoach: (coachId: string, playerId: string) => Effect.Effect<boolean, DatabaseError>;
	}
>()('ttg/db/Videos') {
	static readonly layer = Layer.effect(
		Videos,
		Effect.gen(function* () {
			const db = yield* Db;
			const one = (text: string, params: readonly unknown[]) =>
				db.maybeOne<VideoRow>(text, params).pipe(Effect.map((r) => (r ? toVideo(r) : undefined)));
			return Videos.of({
				create: (i) =>
					one(
						`insert into videos (id, owner_id, kind, source_key, size_bytes, title) values ($1, $2, $3, $4, $5, $6)
						 returning ${COLUMNS}`,
						[i.id, i.ownerId, i.kind, i.sourceKey, i.sizeBytes, i.title ?? null]
					).pipe(Effect.map((v) => v!)),
				find: (id) => one(`select ${COLUMNS} from videos where id = $1`, [id]),
				listByOwner: (ownerId, limit = 100) =>
					db
						.query<VideoRow>(`select ${COLUMNS} from videos where owner_id = $1 and kind <> 'reference' order by created_at desc limit $2`, [ownerId, limit])
						.pipe(Effect.map((rows) => rows.map(toVideo))),
				listReferences: ({ readyOnly, limit = 200 }) =>
					db
						.query<VideoRow>(
							`select ${COLUMNS} from videos where kind = 'reference' and status ${readyOnly ? "= 'ready'" : "<> 'pending'"}
							 order by created_at desc limit $1`,
							[limit]
						)
						.pipe(Effect.map((rows) => rows.map(toVideo))),
				markUploaded: (id, sizeBytes) =>
					one(
						`update videos set status = 'uploaded', size_bytes = $2, error_code = null
						 where id = $1 and status in ('pending', 'uploaded') returning ${COLUMNS}`,
						[id, sizeBytes]
					),
				claimForProcessing: (id) =>
					one(`update videos set status = 'processing' where id = $1 and status in ('uploaded', 'processing') returning ${COLUMNS}`, [id]),
				markReady: (id, o) =>
					db.transaction((tx) =>
						Effect.gen(function* () {
							const prev = yield* tx.maybeOne<{ owner_id: string; status: string; title: string | null; kind: string }>(
								`select owner_id, status, title, kind from videos where id = $1 for update`,
								[id]
							);
							yield* tx.query(
								`update videos set status = 'ready', error_code = null, processed_key = $2, thumbnail_key = $3, sprite_key = $4,
								   duration_ms = $5, fps = $6, width = $7, height = $8 where id = $1`,
								[id, o.processedKey, o.thumbnailKey, o.spriteKey, o.durationMs, o.fps, o.width, o.height]
							);
							if (!prev || prev.status === 'ready') return undefined;
							return yield* insertNotification(tx, prev.owner_id, 'video_ready', { videoId: id, title: prev.title, kind: prev.kind });
						})
					),
				markFailed: (id, errorCode) =>
					db.transaction((tx) =>
						Effect.gen(function* () {
							const prev = yield* tx.maybeOne<{ owner_id: string; status: string; title: string | null; kind: string }>(
								`select owner_id, status, title, kind from videos where id = $1 for update`,
								[id]
							);
							yield* tx.query(`update videos set status = 'failed', error_code = $2 where id = $1`, [id, errorCode]);
							if (!prev || prev.status === 'failed') return undefined;
							return yield* insertNotification(tx, prev.owner_id, 'video_failed', { videoId: id, title: prev.title, kind: prev.kind, errorCode });
						})
					),
				failStalled: (graceSeconds) =>
					db
						.query<{ id: string }>(
							`update videos v set status = 'failed', error_code = 'PROCESSING_STALLED'
							 where v.status = 'processing' and v.updated_at < now() - make_interval(secs => $1)
							   and not exists (
							     select 1 from pgboss.job j
							     where j.name = 'video.uploaded' and j.singleton_key = v.id::text
							       and j.state in ('created', 'retry', 'active'))
							 returning v.id`,
							[graceSeconds]
						)
						.pipe(Effect.map((rows) => rows.map((r) => r.id))),
				listAbandonedPending: (olderThanSeconds, limit = 200) =>
					db
						.query<VideoRow>(
							`select ${COLUMNS} from videos where status = 'pending' and created_at < now() - make_interval(secs => $1)
							 order by created_at limit $2`,
							[olderThanSeconds, limit]
						)
						.pipe(Effect.map((rows) => rows.map(toVideo))),
				deletePending: (id) =>
					db.query(`delete from videos where id = $1 and status = 'pending' returning id`, [id]).pipe(Effect.map((rows) => rows.length > 0)),
				isAssignedCoach: (coachId, playerId) =>
					db
						.maybeOne(`select 1 as ok from coach_assignments where coach_id = $1 and player_id = $2 and status = 'active'`, [
							coachId,
							playerId
						])
						.pipe(Effect.map((r) => r !== undefined))
			});
		})
	);
}
