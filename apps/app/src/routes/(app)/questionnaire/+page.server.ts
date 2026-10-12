import { redirect } from '@sveltejs/kit';
import { getQuestionnaire } from '#lib/server/questionnaire';
import { runLoad } from '#lib/server/runtime';
import type { PageServerLoad } from './$types';

/** Player intake: the form, the open draft (to resume) and the latest completed response. Coaches have no intake. */
export const load: PageServerLoad = async (event) => {
	const { user } = await event.parent();
	if (user.role === 'coach') redirect(303, '/coach');
	return runLoad(event, getQuestionnaire);
};
