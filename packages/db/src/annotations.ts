import type { AnnotationShape } from '@ttg/shared';
import { Context, Effect, Layer } from 'effect';
import { Db } from './db';
import type { DatabaseError } from './errors';

export interface Annotation {
	readonly id: string;
	readonly videoId: string;
	readonly authorId: string;
	readonly startMs: number;
	readonly endMs: number;
	readonly shape: AnnotationShape;
	readonly version: number;
	readonly createdAt: Date;
	readonly updatedAt: Date;
}

interface AnnotationRow {
	id: string;
	video_id: string;
	author_id: string;
	start_ms: number;
	end_ms: number;
	shape: AnnotationShape;
	version: number;
	created_at: Date;
	updated_at: Date;
}

const COLUMNS = 'id, video_id, author_id, start_ms, end_ms, shape, version, created_at, updated_at';

const toAnnotation = (r: AnnotationRow): Annotation => ({
	id: r.id,
	videoId: r.video_id,
	authorId: r.author_id,
	startMs: r.start_ms,
	endMs: r.end_ms,
	shape: r.shape,
	version: r.version,
	createdAt: r.created_at,
	updatedAt: r.updated_at
});

/** Result of a versioned write: the new row, a stale `version`, or no such annotation on that video. */
export type AnnotationWrite =
	| { readonly _tag: 'Updated'; readonly annotation: Annotation }
	| { readonly _tag: 'Stale' }
	| { readonly _tag: 'Missing' };

export class Annotations extends Context.Service<
	Annotations,
	{
		/** Annotations on a video, in timeline order. */
		readonly listByVideo: (videoId: string) => Effect.Effect<readonly Annotation[], DatabaseError>;
		readonly countByVideo: (videoId: string) => Effect.Effect<number, DatabaseError>;
		readonly create: (input: {
			videoId: string;
			authorId: string;
			startMs: number;
			endMs: number;
			shape: AnnotationShape;
		}) => Effect.Effect<Annotation, DatabaseError>;
		/**
		 * Change time range and/or shape if `version` is still current; bumps `version`. The id is scoped to the
		 * video, so an id from another video is `Missing`.
		 */
		readonly update: (input: {
			id: string;
			videoId: string;
			version: number;
			startMs?: number;
			endMs?: number;
			shape?: AnnotationShape;
		}) => Effect.Effect<AnnotationWrite, DatabaseError>;
		/** Delete; with `version`, only if it is still current. */
		readonly remove: (input: { id: string; videoId: string; version?: number }) => Effect.Effect<AnnotationWrite, DatabaseError>;
	}
>()('ttg/db/Annotations') {
	static readonly layer = Layer.effect(
		Annotations,
		Effect.gen(function* () {
			const db = yield* Db;
			const exists = (id: string, videoId: string) =>
				db.maybeOne(`select 1 as ok from annotations where id = $1 and video_id = $2`, [id, videoId]).pipe(Effect.map((r) => r !== undefined));
			return Annotations.of({
				listByVideo: (videoId) =>
					db
						.query<AnnotationRow>(`select ${COLUMNS} from annotations where video_id = $1 order by start_ms, created_at`, [videoId])
						.pipe(Effect.map((rows) => rows.map(toAnnotation))),
				countByVideo: (videoId) =>
					db.maybeOne<{ n: string }>(`select count(*) as n from annotations where video_id = $1`, [videoId]).pipe(Effect.map((r) => Number(r?.n ?? 0))),
				create: (i) =>
					db
						.maybeOne<AnnotationRow>(
							`insert into annotations (video_id, author_id, start_ms, end_ms, shape) values ($1, $2, $3, $4, $5::jsonb)
							 returning ${COLUMNS}`,
							[i.videoId, i.authorId, i.startMs, i.endMs, JSON.stringify(i.shape)]
						)
						.pipe(Effect.map((r) => toAnnotation(r!))),
				update: (i) =>
					Effect.gen(function* () {
						const row = yield* db.maybeOne<AnnotationRow>(
							`update annotations set
							   start_ms = coalesce($4, start_ms), end_ms = coalesce($5, end_ms), shape = coalesce($6::jsonb, shape),
							   version = version + 1
							 where id = $1 and video_id = $2 and version = $3 returning ${COLUMNS}`,
							[i.id, i.videoId, i.version, i.startMs ?? null, i.endMs ?? null, i.shape ? JSON.stringify(i.shape) : null]
						);
						if (row) return { _tag: 'Updated', annotation: toAnnotation(row) } as const;
						return (yield* exists(i.id, i.videoId)) ? ({ _tag: 'Stale' } as const) : ({ _tag: 'Missing' } as const);
					}),
				remove: (i) =>
					Effect.gen(function* () {
						const row = yield* db.maybeOne<AnnotationRow>(
							`delete from annotations where id = $1 and video_id = $2 and ($3::int is null or version = $3) returning ${COLUMNS}`,
							[i.id, i.videoId, i.version ?? null]
						);
						if (row) return { _tag: 'Updated', annotation: toAnnotation(row) } as const;
						return (yield* exists(i.id, i.videoId)) ? ({ _tag: 'Stale' } as const) : ({ _tag: 'Missing' } as const);
					})
			});
		})
	);
}
