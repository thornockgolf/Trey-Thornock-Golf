import { overlayLinkFor } from '#lib/server/analyses';
import { runLoad } from '#lib/server/runtime';
import { videoDetail } from '#lib/server/videos';
import type { PageServerLoad } from './$types';

/**
 * The video and, once ready, its signed playback URLs. `app:video` lets the page poll while it processes. Also the
 * coach's saved comparison for this video, if there is one, so the player can open it.
 */
export const load: PageServerLoad = async (event) => {
	event.depends('app:video');
	const detail = await runLoad(event, videoDetail);
	const link = detail.video.kind === 'reference' ? null : await runLoad(event, overlayLinkFor(detail.video.id));
	return { ...detail, comparisonAnalysisId: link?.analysisId ?? null };
};
