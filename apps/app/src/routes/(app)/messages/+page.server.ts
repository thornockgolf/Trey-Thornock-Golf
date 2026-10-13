import { redirect } from '@sveltejs/kit';
import { currentUser } from '#lib/server/auth';
import { listConversations } from '#lib/server/chat';
import { runLoad } from '#lib/server/runtime';
import { Effect } from 'effect';
import type { PageServerLoad } from './$types';

/** A player has one coach, so /messages goes straight to that conversation. A coach sees the list. */
export const load: PageServerLoad = async (event) => {
	const { role, first } = await runLoad(
		event,
		Effect.gen(function* () {
			const user = yield* currentUser;
			const { conversations } = yield* listConversations;
			return { role: user.role, first: conversations.length === 1 ? conversations[0]!.id : null };
		})
	);
	if (role === 'player' && first) redirect(303, `/messages/${first}`);
	return {};
};
