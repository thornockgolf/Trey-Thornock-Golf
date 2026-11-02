import { readOverlay, type OverlaySettings } from '@ttg/shared';
import { Context, Effect, Layer } from 'effect';
import { Db } from './db';
import type { DatabaseError } from './errors';

export interface Analysis {
	readonly id: string;
	readonly videoId: string;
	readonly coachId: string;
	readonly title: string | null;
	/** Always a full, valid object (defaults when nothing was saved or the stored JSON is invalid). */
	readonly overlay: OverlaySettings;
	readonly createdAt: Date;
}

interface AnalysisRow {
	id: string;
	video_id: string;
	coach_id: string;
	title: string | null;
	overlay_settings: unknown;
	created_at: Date;
}

const COLUMNS = 'id, video_id, coach_id, title, overlay_settings, created_at';

const toAnalysis = (r: AnalysisRow): Analysis => ({
	id: r.id,
	videoId: r.video_id,
	coachId: r.coach_id,
	title: r.title,
	overlay: readOverlay(r.overlay_settings),
	createdAt: r.created_at
});

/** What `Analyses.viewState` says about a video's analyses. */
export interface AnalysisViewState {
	/** At least one analysis of the video has a live recording or a saved comparison. */
	readonly published: boolean;
	readonly playerId: string;
	readonly playerName: string;
	readonly firstViewedAt: Date | null;
	readonly lastViewedAt: Date | null;
	/** When the newest live recording was committed. */
	readonly publishedAt: Date | null;
}

/** An analysis the player can open: a live recording, or a comparison video saved in its overlay settings. */
const PUBLISHED_SQL = `(exists (select 1 from analysis_segments s where s.analysis_id = a.id and s.status = 'ready' and s.replaced_at is null)
	or a.overlay_settings ->> 'overlayVideoId' is not null)`;

export class Analyses extends Context.Service<
	Analyses,
	{
		readonly create: (input: { videoId: string; coachId: string; title?: string | null }) => Effect.Effect<Analysis, DatabaseError>;
		readonly find: (id: string) => Effect.Effect<Analysis | undefined, DatabaseError>;
		/** Replace the overlay settings; undefined when the analysis does not exist. */
		readonly setOverlay: (id: string, settings: OverlaySettings) => Effect.Effect<Analysis | undefined, DatabaseError>;
		/** The newest analysis of a video that has an overlay video chosen (what a player is shown). */
		readonly latestWithOverlay: (videoId: string) => Effect.Effect<Analysis | undefined, DatabaseError>;
		/** The coach's newest analysis of a video, if they have started one (the recorder reopens it). */
		readonly latestByCoach: (videoId: string, coachId: string) => Effect.Effect<Analysis | undefined, DatabaseError>;
		/** The newest analysis of a video that has at least one live recording (what a player hears). */
		readonly latestWithRecording: (videoId: string) => Effect.Effect<Analysis | undefined, DatabaseError>;
		/**
		 * The owning player opened the analysis: keep the first time, move the last. Nothing is recorded (undefined) unless
		 * `userId` owns the video and the analysis is published (a live recording or a saved comparison), so a coach's
		 * preview or a draft never counts. Safe to repeat.
		 */
		readonly recordView: (analysisId: string, userId: string) => Effect.Effect<{ firstViewedAt: Date; lastViewedAt: Date } | undefined, DatabaseError>;
		/** Whether the video's owner has opened any published analysis of it (undefined for an unknown video). */
		readonly viewState: (videoId: string) => Effect.Effect<AnalysisViewState | undefined, DatabaseError>;
	}
>()('ttg/db/Analyses') {
	static readonly layer = Layer.effect(
		Analyses,
		Effect.gen(function* () {
			const db = yield* Db;
			const one = (text: string, params: readonly unknown[]) =>
				db.maybeOne<AnalysisRow>(text, params).pipe(Effect.map((r) => (r ? toAnalysis(r) : undefined)));
			return Analyses.of({
				create: (i) =>
					one(`insert into analyses (video_id, coach_id, title) values ($1, $2, $3) returning ${COLUMNS}`, [i.videoId, i.coachId, i.title ?? null]).pipe(
						Effect.map((a) => a!)
					),
				find: (id) => one(`select ${COLUMNS} from analyses where id = $1`, [id]),
				setOverlay: (id, settings) =>
					one(`update analyses set overlay_settings = $2::jsonb where id = $1 returning ${COLUMNS}`, [id, JSON.stringify(settings)]),
				latestWithOverlay: (videoId) =>
					one(
						`select ${COLUMNS} from analyses where video_id = $1 and overlay_settings ->> 'overlayVideoId' is not null
						 order by updated_at desc limit 1`,
						[videoId]
					),
				latestByCoach: (videoId, coachId) =>
					one(`select ${COLUMNS} from analyses where video_id = $1 and coach_id = $2 order by created_at desc limit 1`, [videoId, coachId]),
				latestWithRecording: (videoId) =>
					one(
						`select ${COLUMNS} from analyses a where video_id = $1
						 and exists (select 1 from analysis_segments s where s.analysis_id = a.id and s.status = 'ready' and s.replaced_at is null)
						 order by (select max(s.committed_at) from analysis_segments s where s.analysis_id = a.id and s.status = 'ready' and s.replaced_at is null) desc
						 limit 1`,
						[videoId]
					),
				recordView: (analysisId, userId) =>
					db
						.maybeOne<{ first_viewed_at: Date; last_viewed_at: Date }>(
							`insert into analysis_views (analysis_id, user_id)
							 select a.id, v.owner_id from analyses a join videos v on v.id = a.video_id
							  where a.id = $1 and v.owner_id = $2 and v.kind = 'swing' and ${PUBLISHED_SQL}
							 on conflict (analysis_id, user_id) do update set last_viewed_at = now()
							 returning first_viewed_at, last_viewed_at`,
							[analysisId, userId]
						)
						.pipe(Effect.map((r) => (r ? { firstViewedAt: r.first_viewed_at, lastViewedAt: r.last_viewed_at } : undefined))),
				viewState: (videoId) =>
					db
						.maybeOne<{
							player_id: string;
							player_name: string | null;
							player_email: string | null;
							published: boolean;
							first_viewed_at: Date | null;
							last_viewed_at: Date | null;
							published_at: Date | null;
						}>(
							`select u.id as player_id, u.display_name as player_name, u.email as player_email,
							   exists (select 1 from analyses a where a.video_id = v.id and ${PUBLISHED_SQL}) as published,
							   (select min(av.first_viewed_at) from analysis_views av join analyses a on a.id = av.analysis_id where a.video_id = v.id and av.user_id = v.owner_id) as first_viewed_at,
							   (select max(av.last_viewed_at) from analysis_views av join analyses a on a.id = av.analysis_id where a.video_id = v.id and av.user_id = v.owner_id) as last_viewed_at,
							   (select max(s.committed_at) from analysis_segments s join analyses a on a.id = s.analysis_id
							     where a.video_id = v.id and s.status = 'ready' and s.replaced_at is null) as published_at
							 from videos v join users u on u.id = v.owner_id where v.id = $1`,
							[videoId]
						)
						.pipe(
							Effect.map((r) =>
								r
									? {
											published: r.published,
											playerId: r.player_id,
											playerName: r.player_name?.trim() || r.player_email?.trim() || 'the player',
											firstViewedAt: r.first_viewed_at,
											lastViewedAt: r.last_viewed_at,
											publishedAt: r.published_at
										}
									: undefined
							)
						)
			});
		})
	);
}
