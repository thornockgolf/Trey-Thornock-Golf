import { listMyVideos } from '#lib/server/videos';
import { runLoad } from '#lib/server/runtime';
import type { PageServerLoad } from './$types';

/** The signed-in user's videos, loaded in-process (no fetch to our own API). `app:videos` lets the page poll. */
export const load: PageServerLoad = async (event) => {
	event.depends('app:videos');
	return { videos: (await runLoad(event, listMyVideos)).videos };
};
