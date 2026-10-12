import { Analyses, Videos, type Video } from '@ttg/db';
import type { OverlaySettings, VideoDto } from '@ttg/shared';
import { Effect } from 'effect';
import { currentUser } from './auth';
import { RequestContext } from './request-context';
import { toDto, viewableVideo } from './videos';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Data for `/compare`: the videos the caller may put in a slot (their own ready videos and the reference library),
 * plus any video named in `?a=` / `?b=` that they may see (a coach opening a player's video), and the saved
 * overlay setup when `?analysis=` is given. Playback URLs are fetched by the page per video.
 */
export const compareData = Effect.gen(function* () {
	const user = yield* currentUser;
	const { event } = yield* RequestContext;
	const q = event.url.searchParams;
	const videos = yield* Videos;
	const ready = (v: Video) => v.status === 'ready' && v.durationMs !== null && v.fps !== null;

	const own = (yield* videos.listByOwner(user.id)).filter(ready);
	const references = (yield* videos.listReferences({ readyOnly: true })).filter(ready);
	const known = new Set([...own, ...references].map((v) => v.id));

	const named = [q.get('a'), q.get('b')].filter((id): id is string => !!id && UUID.test(id) && !known.has(id));
	const others: Video[] = [];
	for (const id of new Set(named)) {
		const found = yield* viewableVideo(id, user).pipe(Effect.option);
		if (found._tag === 'Some' && ready(found.value)) others.push(found.value);
	}

	let analysis: { id: string; videoId: string; settings: OverlaySettings } | null = null;
	const analysisId = q.get('analysis');
	if (analysisId && UUID.test(analysisId)) {
		const found = yield* (yield* Analyses).find(analysisId);
		if (found) {
			const base = yield* viewableVideo(found.videoId, user).pipe(Effect.option);
			if (base._tag === 'Some') {
				analysis = { id: found.id, videoId: found.videoId, settings: found.overlay };
				if (ready(base.value) && !known.has(base.value.id) && !others.some((o) => o.id === base.value.id)) others.push(base.value);
				const ov = found.overlay.overlayVideoId;
				if (ov && !known.has(ov) && !others.some((o) => o.id === ov)) {
					const over = yield* viewableVideo(ov, user).pipe(Effect.option);
					if (over._tag === 'Some' && ready(over.value)) others.push(over.value);
				}
			}
		}
	}

	const dto = (list: readonly Video[]): VideoDto[] => list.map((v) => toDto(v));
	return { role: user.role, own: dto(own), others: dto(others), references: dto(references), analysis };
});
