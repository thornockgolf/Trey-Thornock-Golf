import { redirect } from '@sveltejs/kit';
import { editPageData } from '#lib/server/logged-sessions';
import { runLoad } from '#lib/server/runtime';
import type { PageServerLoad } from './$types';

/** Edit one of your own logged sessions (add a video later, fix the notes, delete it). */
export const load: PageServerLoad = async (event) => {
	const { user } = await event.parent();
	if (user.role === 'coach') redirect(303, '/coach');
	return runLoad(event, editPageData);
};
