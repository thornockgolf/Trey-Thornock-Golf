import { redirect } from '@sveltejs/kit';
import { sessionPageData } from '#lib/server/plans';
import { runLoad } from '#lib/server/runtime';
import type { PageServerLoad } from './$types';

/** One of the player's own sessions (linked from the calendar). Coaches author plans from their own screens. */
export const load: PageServerLoad = async (event) => {
	const { user } = await event.parent();
	if (user.role === 'coach') redirect(303, '/coach');
	return runLoad(event, sessionPageData);
};
