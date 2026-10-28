import { redirect } from '@sveltejs/kit';
import { conversationToOpen } from '#lib/server/chat';
import { runLoad } from '#lib/server/runtime';
import type { PageServerLoad } from './$types';

/** `/messages/new?player=` (a coach names the player; a player gets their coach): open the right conversation. Messages about a video are written on that video's page, so this only opens the general thread. */
export const load: PageServerLoad = async (event) => {
	const found = await runLoad(event, conversationToOpen);
	if (!found) return { noCoach: true };
	redirect(303, `/messages/${found.id}`);
};
