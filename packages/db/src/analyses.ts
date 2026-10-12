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
					)
			});
		})
	);
}
