import { redirect } from '@sveltejs/kit';
import { listMyVideos } from '#lib/server/videos';
import { runLoad } from '#lib/server/runtime';
import type { PageServerLoad } from './$types';

/**
 * The signed-in player's videos, loaded in-process (no fetch to our own API). `app:videos` lets the page poll.
 * Coaches have no list of their own: they start from the dashboard (videos to record) and a player's page.
 */
export const load: PageServerLoad = async (event) => {
	const { user } = await event.parent();
	if (user.role === 'coach') redirect(303, '/coach');
	event.depends('app:videos');
	return { videos: (await runLoad(event, listMyVideos)).videos };
};
