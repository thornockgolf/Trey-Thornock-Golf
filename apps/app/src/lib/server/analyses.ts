import { Analyses, Videos, type Analysis } from '@ttg/db';
import { CreateAnalysisRequest, OverlaySettings, type AnalysisDto, type AnalysisViewDto, type CurrentUserData, type OverlayResponse } from '@ttg/shared';
import { Effect } from 'effect';
import { currentUser, requireRole } from './auth';
import { decodeBody } from './decode';
import { NotFound, ValidationError } from './errors';
import { RequestContext } from './request-context';
import { videoDetail, videoIdParam, viewableVideo } from './videos';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const toAnalysisDto = (a: Analysis): AnalysisDto => ({
	id: a.id,
	videoId: a.videoId,
	coachId: a.coachId,
	title: a.title,
	createdAt: a.createdAt.toISOString()
});

/** The analysis behind `:id`, if the caller may see the video it analyses (owner or assigned coach). */
export const viewableAnalysis = (user: CurrentUserData) =>
	Effect.gen(function* () {
		const { event } = yield* RequestContext;
		const id = event.params.id ?? '';
		if (!UUID.test(id)) return yield* new NotFound({ message: 'Analysis not found' });
		const analysis = yield* (yield* Analyses).find(id);
		if (!analysis) return yield* new NotFound({ message: 'Analysis not found' });
		const video = yield* viewableVideo(analysis.videoId, user);
		return { analysis, video };
	});

/** `POST /api/analyses`: a coach starts an analysis of a video they may see. Reference clips are not analysed. */
export const createAnalysis = Effect.gen(function* () {
	const coach = yield* requireRole('coach');
	const body = yield* decodeBody(CreateAnalysisRequest);
	const video = yield* viewableVideo(body.videoId, coach);
	if (video.kind === 'reference') return yield* new ValidationError({ message: 'Invalid request: check videoId' });
	const created = yield* (yield* Analyses).create({ videoId: video.id, coachId: coach.id, title: body.title?.trim() || null });
	return toAnalysisDto(created);
});

/** `GET /api/analyses/:id/overlay`: the saved overlay setup, for the owner and any coach who may see the video. */
export const getOverlay = Effect.gen(function* () {
	const user = yield* currentUser;
	const { analysis } = yield* viewableAnalysis(user);
	return { analysisId: analysis.id, videoId: analysis.videoId, settings: analysis.overlay } satisfies OverlayResponse;
});

/**
 * `PUT /api/analyses/:id/overlay`: coach only. The overlay video must be one the player can also open (a reference
 * clip or another video of the same owner), and the sync points must lie inside their videos.
 */
export const putOverlay = Effect.gen(function* () {
	const coach = yield* requireRole('coach');
	const settings = yield* decodeBody(OverlaySettings);
	const { analysis, video: base } = yield* viewableAnalysis(coach);
	const invalid = (field: string) => new ValidationError({ message: `Invalid request: check ${field}` });

	if (base.durationMs !== null && settings.baseSyncMs > base.durationMs) return yield* invalid('baseSyncMs');
	if (settings.overlayVideoId) {
		const overlay = yield* (yield* Videos).find(settings.overlayVideoId);
		if (!overlay) return yield* invalid('overlayVideoId');
		yield* viewableVideo(overlay.id, coach);
		if (overlay.kind !== 'reference' && overlay.ownerId !== base.ownerId) return yield* invalid('overlayVideoId');
		if (overlay.durationMs !== null && settings.overlaySyncMs > overlay.durationMs) return yield* invalid('overlaySyncMs');
	}
	const saved = yield* (yield* Analyses).setOverlay(analysis.id, settings);
	if (!saved) return yield* new NotFound({ message: 'Analysis not found' });
	return { analysisId: saved.id, videoId: saved.videoId, settings: saved.overlay } satisfies OverlayResponse;
});

/** For the video page: the newest analysis of this video that has an overlay saved (the coach's comparison), if any. */
export const overlayLinkFor = (videoId: string) =>
	Effect.gen(function* () {
		const found = yield* (yield* Analyses).latestWithOverlay(videoId);
		return found ? { analysisId: found.id } : null;
	});


/** For the video page: the newest analysis of this video that has a live recording, so the player hears the coach. */
export const commentaryLinkFor = (videoId: string) =>
	Effect.gen(function* () {
		const found = yield* (yield* Analyses).latestWithRecording(videoId);
		return found ? { analysisId: found.id } : null;
	});

/**
 * Data for `/coach/videos/:id/analyze`: the video with its playback URLs, and the coach's newest analysis of it (null
 * until they record something: the page creates the analysis then). Reference clips are not analysed.
 */
export const analyzeData = Effect.gen(function* () {
	const coach = yield* requireRole('coach');
	const detail = yield* videoDetail;
	if (detail.video.kind === 'reference') return yield* new NotFound({ message: 'Video not found' });
	const latest = yield* (yield* Analyses).latestByCoach(detail.video.id, coach.id);
	return { ...detail, analysisId: latest?.id ?? null, analysisView: detail.video.kind === 'swing' ? yield* analysisViewFor(detail.video.id) : null };
});

/**
 * `POST /api/analyses/:id/view`: the player opened the coach's analysis (the commentary on their video page, or the
 * saved comparison). Recorded only for the video's owner and only once the analysis is published (a live recording or a
 * saved comparison); a coach's preview, anyone else, or a draft changes nothing (`{ recorded: false }`). Repeating it
 * keeps the first time and moves the last.
 */
export const recordAnalysisView = Effect.gen(function* () {
	const user = yield* currentUser;
	const { analysis, video } = yield* viewableAnalysis(user);
	if (user.role !== 'player' || video.ownerId !== user.id) return { recorded: false };
	const view = yield* (yield* Analyses).recordView(analysis.id, user.id);
	return { recorded: view !== undefined };
});

/** The coach's line "Opened by Sam ..." for a video: `null` for a video that is not a swing. The caller has checked the coach may see the video. */
export const analysisViewFor = (videoId: string) =>
	Effect.gen(function* () {
		const s = yield* (yield* Analyses).viewState(videoId);
		if (!s) return null;
		const state = !s.published ? 'unpublished' : s.firstViewedAt ? 'opened' : 'unopened';
		return {
			state,
			playerName: s.playerName,
			firstViewedAt: s.firstViewedAt?.toISOString() ?? null,
			lastViewedAt: s.lastViewedAt?.toISOString() ?? null,
			updatedSinceOpened: !!(s.lastViewedAt && s.publishedAt && s.publishedAt > s.lastViewedAt)
		} satisfies AnalysisViewDto;
	});

/** `GET /api/videos/:id/analysis-view`: coach only, for a video they may see. */
export const getAnalysisView = Effect.gen(function* () {
	const coach = yield* requireRole('coach');
	const video = yield* viewableVideo(yield* videoIdParam, coach);
	if (video.kind !== 'swing') return yield* new NotFound({ message: 'Video not found' });
	return yield* analysisViewFor(video.id);
});

/** For a coach's `/videos/:id`: the "Opened by ..." state; `null` for players and reference clips. */
export const analysisViewForCoach = (video: { id: string; kind: string }) =>
	Effect.gen(function* () {
		const user = yield* currentUser;
		return user.role === 'coach' && video.kind === 'swing' ? yield* analysisViewFor(video.id) : null;
	});
