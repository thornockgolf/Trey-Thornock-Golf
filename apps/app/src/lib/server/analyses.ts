import { Analyses, Videos, type Analysis } from '@ttg/db';
import { CreateAnalysisRequest, OverlaySettings, type AnalysisDto, type CurrentUserData, type OverlayResponse } from '@ttg/shared';
import { Effect } from 'effect';
import { currentUser, requireRole } from './auth';
import { decodeBody } from './decode';
import { NotFound, ValidationError } from './errors';
import { RequestContext } from './request-context';
import { videoDetail, viewableVideo } from './videos';

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
	return { ...detail, analysisId: latest?.id ?? null };
});
