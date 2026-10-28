import { redirect } from '@sveltejs/kit';
import { homeData } from '#lib/server/plans';
import { runLoad } from '#lib/server/runtime';
import type { PageServerLoad } from './$types';

/** The player's Home: today's lesson and the roadmap. Coaches start from their own dashboard. */
export const load: PageServerLoad = async (event) => {
	const { user } = await event.parent();
	if (user.role === 'coach') redirect(303, '/coach');
	return runLoad(event, homeData);
};
