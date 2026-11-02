import { redirect } from '@sveltejs/kit';
import { logPageData } from '#lib/server/logged-sessions';
import { runLoad } from '#lib/server/runtime';
import type { PageServerLoad } from './$types';

/** "Log a session": practice that is not on the plan. Players only. */
export const load: PageServerLoad = async (event) => {
	const { user } = await event.parent();
	if (user.role === 'coach') redirect(303, '/coach');
	return runLoad(event, logPageData);
};
