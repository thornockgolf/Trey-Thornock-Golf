import { analyzeData } from '#lib/server/analyses';
import { runLoad } from '#lib/server/runtime';
import type { PageServerLoad } from './$types';

/** Under `/coach`, so `coachGuard` limits it to coaches. The video, its playback URLs and the coach's analysis of it. */
export const load: PageServerLoad = async (event) => {
	event.depends('app:video');
	return runLoad(event, analyzeData);
};
