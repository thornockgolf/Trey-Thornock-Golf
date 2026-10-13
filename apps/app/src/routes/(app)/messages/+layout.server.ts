import { listConversations } from '#lib/server/chat';
import { runLoad } from '#lib/server/runtime';
import type { LayoutServerLoad } from './$types';

/** The signed-in user's conversations: the list beside the thread. */
export const load: LayoutServerLoad = async (event) => {
	event.depends('app:conversations');
	return runLoad(event, listConversations);
};
