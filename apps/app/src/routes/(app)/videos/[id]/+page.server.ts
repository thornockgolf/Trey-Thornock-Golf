import { runLoad } from '#lib/server/runtime';
import { videoDetail } from '#lib/server/videos';
import type { PageServerLoad } from './$types';

/** The video and, once ready, its signed playback URLs. `app:video` lets the page poll while it processes. */
export const load: PageServerLoad = async (event) => {
	event.depends('app:video');
	return runLoad(event, videoDetail);
};
