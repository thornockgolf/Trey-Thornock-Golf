import { listReferences } from '#lib/server/videos';
import { runLoad } from '#lib/server/runtime';
import type { PageServerLoad } from './$types';

/** The reference library. Under `/coach`, so `coachGuard` already limits the page to coaches. `app:references` lets it poll. */
export const load: PageServerLoad = async (event) => {
	event.depends('app:references');
	return { videos: (await runLoad(event, listReferences)).videos };
};
