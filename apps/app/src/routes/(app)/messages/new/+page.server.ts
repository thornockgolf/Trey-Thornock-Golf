import { redirect } from '@sveltejs/kit';
import { conversationToOpen } from '#lib/server/chat';
import { runLoad } from '#lib/server/runtime';
import type { PageServerLoad } from './$types';

/** `/messages/new?video=&ms=` (or `?player=` for a coach): open the right conversation, keeping the video reference. */
export const load: PageServerLoad = async (event) => {
	const found = await runLoad(event, conversationToOpen);
	if (!found) return { noCoach: true };
	const keep = new URLSearchParams();
	for (const k of ['video', 'ms']) {
		const v = event.url.searchParams.get(k);
		if (v) keep.set(k, v);
	}
	redirect(303, `/messages/${found.id}${keep.size > 0 ? `?${keep}` : ''}`);
};
