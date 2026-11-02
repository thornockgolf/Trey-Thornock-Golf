import { redirect } from '@sveltejs/kit';
import { checkInPageData } from '#lib/server/calendar';
import { runLoad } from '#lib/server/runtime';
import type { PageServerLoad } from './$types';

/** "Log a check-in": a check-in of your own, not one Trey scheduled. Players only. */
export const load: PageServerLoad = async (event) => {
	const { user } = await event.parent();
	if (user.role === 'coach') redirect(303, '/coach');
	return runLoad(event, checkInPageData);
};
