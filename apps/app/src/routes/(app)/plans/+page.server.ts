import { redirect } from '@sveltejs/kit';
import { listMySessions } from '#lib/server/plans';
import { runLoad } from '#lib/server/runtime';
import type { PageServerLoad } from './$types';

/** The player's assigned practice sessions. Coaches author plans from their own screens. */
export const load: PageServerLoad = async (event) => {
	const { user } = await event.parent();
	if (user.role === 'coach') redirect(303, '/coach');
	return runLoad(event, listMySessions);
};
