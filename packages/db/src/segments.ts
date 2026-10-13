import { planReplace, type SegmentStatus } from '@ttg/shared';
import { Context, Effect, Layer } from 'effect';
import { insertNotification, type Notification } from './notifications';
import { Db, type Queryer } from './db';
import type { DatabaseError } from './errors';

export interface Segment {
	readonly id: string;
	readonly analysisId: string;
	readonly position: number;
	readonly startMs: number;
	readonly endMs: number;
	readonly status: SegmentStatus;
	/** The normalized MP4/AAC clip; null until the worker has processed the recording. */
	readonly clipKey: string | null;
	/** The browser's raw recording. */
	readonly sourceKey: string | null;
	/** Where in the clip this segment starts playing (non-zero for a trimmed piece). */
	readonly clipStartMs: number;
	readonly hasVideo: boolean;
	readonly errorCode: string | null;
	readonly replacedAt: Date | null;
	readonly committedAt: Date | null;
	readonly undoneAt: Date | null;
	readonly annotationsAction: 'keep' | 'remove';
	readonly createdAt: Date;
}

interface SegmentRow {
	id: string;
	analysis_id: string;
	position: number;
	start_ms: number;
	end_ms: number;
	status: SegmentStatus;
	clip_key: string | null;
	source_key: string | null;
	clip_start_ms: number;
	has_video: boolean;
	error_code: string | null;
	replaced_at: Date | null;
	committed_at: Date | null;
	undone_at: Date | null;
	annotations_action: 'keep' | 'remove';
	created_at: Date;
}

const COLUMNS =
	'id, analysis_id, position, start_ms, end_ms, status, clip_key, source_key, clip_start_ms, has_video, error_code, replaced_at, committed_at, undone_at, annotations_action, created_at';

const toSegment = (r: SegmentRow): Segment => ({
	id: r.id,
	analysisId: r.analysis_id,
	position: r.position,
	startMs: r.start_ms,
	endMs: r.end_ms,
	status: r.status,
	clipKey: r.clip_key,
	sourceKey: r.source_key,
	clipStartMs: r.clip_start_ms,
	hasVideo: r.has_video,
	errorCode: r.error_code,
	replacedAt: r.replaced_at,
	committedAt: r.committed_at,
	undoneAt: r.undone_at,
	annotationsAction: r.annotations_action,
	createdAt: r.created_at
});

export interface CommitResult {
	/** Live segments the new recording replaced. */
	readonly replaced: number;
	/** Annotations deleted because the coach chose to remove them. */
	readonly removedAnnotations: number;
	/** `analysis_ready` for the video's owner, written the first time any recording of this analysis goes live. */
	readonly notification?: Notification | undefined;
}

export type UndoResult =
	| { readonly _tag: 'Undone'; readonly restored: number; readonly restoredAnnotations: number }
	| { readonly _tag: 'NothingToUndo' }
	| { readonly _tag: 'Expired' };

interface RemovedAnnotation {
	author_id: string;
	start_ms: number;
	end_ms: number;
	shape: unknown;
}

export class Segments extends Context.Service<
	Segments,
	{
		/** A new recording waiting for its bytes. It is not part of the analysis until the worker commits it. */
		readonly createPending: (input: {
			id: string;
			analysisId: string;
			startMs: number;
			endMs: number;
			sourceKey: string;
			annotationsAction: 'keep' | 'remove';
		}) => Effect.Effect<Segment, DatabaseError>;
		readonly find: (id: string) => Effect.Effect<Segment | undefined, DatabaseError>;
		/** Segments that are part of the analysis now: ready and not replaced, in timeline order. */
		readonly listLive: (analysisId: string) => Effect.Effect<readonly Segment[], DatabaseError>;
		/** Every row of the analysis (live, replaced, pending), oldest first. For the coach's history and for tests. */
		readonly listAll: (analysisId: string) => Effect.Effect<readonly Segment[], DatabaseError>;
		/** `pending` or `uploaded` -> `uploaded`. Undefined when it is already further along. */
		readonly markUploaded: (id: string) => Effect.Effect<Segment | undefined, DatabaseError>;
		/** Worker: `uploaded` or `processing` (a retry) -> `processing`. Undefined if there is nothing to process. */
		readonly claimForProcessing: (id: string) => Effect.Effect<Segment | undefined, DatabaseError>;
		readonly markFailed: (id: string, errorCode: string) => Effect.Effect<void, DatabaseError>;
		/**
		 * Worker: the normalized clip is stored. In one transaction, make the new segment live and replace the live
		 * segments it overlaps (their parts outside the range stay as trimmed pieces of the same clip); with
		 * `annotationsAction = 'remove'`, delete the video's annotations that start in the range, keeping them for undo.
		 * Serialized per analysis. Repeating it for a segment that is already ready changes nothing.
		 */
		readonly commit: (id: string, out: { clipKey: string; hasVideo: boolean }) => Effect.Effect<CommitResult | undefined, DatabaseError>;
		/**
		 * Reverse the latest operation: its segments are replaced again, the segments it replaced are live again, and
		 * removed annotations come back. Only within `retentionDays` of the operation (the old files are deleted after).
		 */
		readonly undoLast: (analysisId: string, retentionDays: number) => Effect.Effect<UndoResult, DatabaseError>;
		/** Annotations that start inside `startMs`..`endMs` on the analysis's video (to ask the coach before re-recording). */
		readonly countAnnotationsIn: (analysisId: string, startMs: number, endMs: number) => Effect.Effect<number, DatabaseError>;
		/**
		 * Failed or never-finished segments (not live, not replaced) older than `olderThanSeconds`, plus replaced ones
		 * older than `replacedOlderThanDays`: the rows the retention sweep may delete, oldest first.
		 */
		readonly listDeletable: (opts: { abandonedSeconds: number; replacedDays: number; limit?: number }) => Effect.Effect<readonly Segment[], DatabaseError>;
		/** True when a row other than `excludeIds` still points at the object (a trimmed piece shares its clip). */
		readonly keyInUse: (key: string, excludeIds: readonly string[]) => Effect.Effect<boolean, DatabaseError>;
		readonly deleteRow: (id: string) => Effect.Effect<void, DatabaseError>;
		/** `processing` segments with no queued, retrying or active job for over `graceSeconds`: set `failed`. */
		readonly failStalled: (graceSeconds: number) => Effect.Effect<readonly string[], DatabaseError>;
	}
>()('ttg/db/Segments') {
	static readonly layer = Layer.effect(
		Segments,
		Effect.gen(function* () {
			const db = yield* Db;
			const one = (q: Queryer, text: string, params: readonly unknown[]) =>
				q.maybeOne<SegmentRow>(text, params).pipe(Effect.map((r) => (r ? toSegment(r) : undefined)));
			const many = (q: Queryer, text: string, params: readonly unknown[]) =>
				q.query<SegmentRow>(text, params).pipe(Effect.map((rows) => rows.map(toSegment)));
			const nextPosition = (q: Queryer, analysisId: string) =>
				q
					.maybeOne<{ n: number }>(`select coalesce(max(position), -1) + 1 as n from analysis_segments where analysis_id = $1`, [analysisId])
					.pipe(Effect.map((r) => Number(r?.n ?? 0)));

			return Segments.of({
				createPending: (i) =>
					db.transaction((tx) =>
						Effect.gen(function* () {
							yield* tx.query(`select 1 from analyses where id = $1 for update`, [i.analysisId]);
							const position = yield* nextPosition(tx, i.analysisId);
							return (yield* one(
								tx,
								`insert into analysis_segments (id, analysis_id, position, start_ms, end_ms, source_key, annotations_action)
								 values ($1, $2, $3, $4, $5, $6, $7) returning ${COLUMNS}`,
								[i.id, i.analysisId, position, i.startMs, i.endMs, i.sourceKey, i.annotationsAction]
							))!;
						})
					),
				find: (id) => one(db, `select ${COLUMNS} from analysis_segments where id = $1`, [id]),
				listLive: (analysisId) =>
					many(db, `select ${COLUMNS} from analysis_segments where analysis_id = $1 and status = 'ready' and replaced_at is null order by start_ms, position`, [analysisId]),
				listAll: (analysisId) => many(db, `select ${COLUMNS} from analysis_segments where analysis_id = $1 order by position`, [analysisId]),
				markUploaded: (id) =>
					one(db, `update analysis_segments set status = 'uploaded', error_code = null where id = $1 and status in ('pending', 'uploaded') and replaced_at is null returning ${COLUMNS}`, [id]),
				claimForProcessing: (id) =>
					one(db, `update analysis_segments set status = 'processing' where id = $1 and status in ('uploaded', 'processing') and replaced_at is null returning ${COLUMNS}`, [id]),
				markFailed: (id, errorCode) =>
					db.query(`update analysis_segments set status = 'failed', error_code = $2 where id = $1 and status <> 'ready'`, [id, errorCode]).pipe(Effect.asVoid),

				commit: (id, out) =>
					db.transaction((tx) =>
						Effect.gen(function* () {
							const seg = yield* one(tx, `select ${COLUMNS} from analysis_segments where id = $1`, [id]);
							if (!seg) return undefined;
							// one operation at a time per analysis
							const analysis = yield* tx.maybeOne<{ video_id: string; coach_id: string }>(`select video_id, coach_id from analyses where id = $1 for update`, [seg.analysisId]);
							if (!analysis) return undefined;
							const current = yield* one(tx, `select ${COLUMNS} from analysis_segments where id = $1`, [id]);
							if (!current || current.status === 'ready' || current.replacedAt) return undefined; // already done (a retry)
							if (current.status !== 'processing' && current.status !== 'uploaded') return undefined;

							const live = yield* many(
								tx,
								`select ${COLUMNS} from analysis_segments where analysis_id = $1 and status = 'ready' and replaced_at is null order by start_ms`,
								[seg.analysisId]
							);
							const plan = planReplace(
								live.map((l) => ({ id: l.id, startMs: l.startMs, endMs: l.endMs, clipStartMs: l.clipStartMs })),
								current.startMs,
								current.endMs
							);
							let position = yield* nextPosition(tx, seg.analysisId);
							if (plan.replaced.length > 0) {
								yield* tx.query(`update analysis_segments set replaced_at = now(), replaced_by = $2 where id = any($1::uuid[])`, [plan.replaced, id]);
							}
							for (const t of plan.trims) {
								const from = live.find((l) => l.id === t.from)!;
								yield* tx.query(
									`insert into analysis_segments
									   (analysis_id, position, start_ms, end_ms, clip_key, source_key, clip_start_ms, has_video, status, created_by, committed_at)
									 values ($1, $2, $3, $4, $5, $6, $7, $8, 'ready', $9, now())`,
									[seg.analysisId, position++, t.startMs, t.endMs, from.clipKey, from.sourceKey, t.clipStartMs, from.hasVideo, id]
								);
							}

							let removed: RemovedAnnotation[] = [];
							if (current.annotationsAction === 'remove') {
								removed = [
									...(yield* tx.query<RemovedAnnotation>(
										`delete from annotations where video_id = $1 and start_ms >= $2 and start_ms < $3
										 returning author_id, start_ms, end_ms, shape`,
										[analysis.video_id, current.startMs, current.endMs]
									))
								];
							}
							yield* tx.query(
								`update analysis_segments set status = 'ready', error_code = null, clip_key = $2, has_video = $3, clip_start_ms = 0,
								   created_by = id, committed_at = now(), removed_annotations = $4::jsonb
								 where id = $1`,
								[id, out.clipKey, out.hasVideo, removed.length > 0 ? JSON.stringify(removed) : null]
							);
							// Tell the owner once per analysis that their coach's commentary exists.
							const owner = yield* tx.maybeOne<{ owner_id: string; title: string | null }>(`select owner_id, title from videos where id = $1`, [analysis.video_id]);
							const told = yield* tx.maybeOne(
								`select 1 as ok from notifications where user_id = $1 and type = 'analysis_ready' and payload->>'analysisId' = $2`,
								[owner?.owner_id ?? null, seg.analysisId]
							);
							const notification =
								owner && owner.owner_id !== analysis.coach_id && !told
									? yield* insertNotification(tx, owner.owner_id, 'analysis_ready', { analysisId: seg.analysisId, videoId: analysis.video_id, title: owner.title })
									: undefined;
							return { replaced: plan.replaced.length, removedAnnotations: removed.length, ...(notification ? { notification } : {}) } satisfies CommitResult;
						})
					),

				undoLast: (analysisId, retentionDays) =>
					db.transaction((tx) =>
						Effect.gen(function* () {
							const analysis = yield* tx.maybeOne<{ video_id: string }>(`select video_id from analyses where id = $1 for update`, [analysisId]);
							if (!analysis) return { _tag: 'NothingToUndo' } as UndoResult;
							const op = yield* tx.maybeOne<{ id: string; committed_at: Date; fresh: boolean; removed_annotations: RemovedAnnotation[] | null }>(
								`select id, committed_at, removed_annotations,
								        committed_at > now() - make_interval(days => $2) as fresh
								 from analysis_segments
								 where analysis_id = $1 and created_by = id and status = 'ready' and undone_at is null
								 order by committed_at desc, position desc limit 1`,
								[analysisId, retentionDays]
							);
							if (!op) return { _tag: 'NothingToUndo' } as UndoResult;
							if (!op.fresh) return { _tag: 'Expired' } as UndoResult;
							// the operation's rows (the new segment and any trimmed pieces) stop being live...
							yield* tx.query(`update analysis_segments set replaced_at = now(), undone_at = now() where created_by = $1 and replaced_at is null`, [op.id]);
							// ...and the rows it replaced are live again
							const restored = yield* tx.query<{ id: string }>(
								`update analysis_segments set replaced_at = null, replaced_by = null where replaced_by = $1 returning id`,
								[op.id]
							);
							let restoredAnnotations = 0;
							for (const a of op.removed_annotations ?? []) {
								yield* tx.query(
									`insert into annotations (video_id, author_id, start_ms, end_ms, shape) values ($1, $2, $3, $4, $5::jsonb)`,
									[analysis.video_id, a.author_id, a.start_ms, a.end_ms, JSON.stringify(a.shape)]
								);
								restoredAnnotations++;
							}
							return { _tag: 'Undone', restored: restored.length, restoredAnnotations } as UndoResult;
						})
					),

				countAnnotationsIn: (analysisId, startMs, endMs) =>
					db
						.maybeOne<{ n: string }>(
							`select count(*) as n from annotations a join analyses an on an.video_id = a.video_id
							 where an.id = $1 and a.start_ms >= $2 and a.start_ms < $3`,
							[analysisId, startMs, endMs]
						)
						.pipe(Effect.map((r) => Number(r?.n ?? 0))),

				listDeletable: ({ abandonedSeconds, replacedDays, limit = 200 }) =>
					many(
						db,
						`select ${COLUMNS} from analysis_segments
						 where (replaced_at is not null and replaced_at < now() - make_interval(days => $2))
						    or (replaced_at is null and status in ('pending', 'uploaded', 'processing', 'failed')
						        and created_at < now() - make_interval(secs => $1))
						 order by created_at limit $3`,
						[abandonedSeconds, replacedDays, limit]
					),
				keyInUse: (key, excludeIds) =>
					db
						.maybeOne(`select 1 as ok from analysis_segments where (clip_key = $1 or source_key = $1) and not (id = any($2::uuid[])) limit 1`, [key, excludeIds])
						.pipe(Effect.map((r) => r !== undefined)),
				deleteRow: (id) => db.query(`delete from analysis_segments where id = $1`, [id]).pipe(Effect.asVoid),
				failStalled: (graceSeconds) =>
					db
						.query<{ id: string }>(
							`update analysis_segments s set status = 'failed', error_code = 'PROCESSING_STALLED'
							 where s.status = 'processing' and s.updated_at < now() - make_interval(secs => $1)
							   and not exists (
							     select 1 from pgboss.job j
							     where j.name = 'analysis.segment.uploaded' and j.singleton_key = s.id::text
							       and j.state in ('created', 'retry', 'active'))
							 returning s.id`,
							[graceSeconds]
						)
						.pipe(Effect.map((rows) => rows.map((r) => r.id)))
			});
		})
	);
}
