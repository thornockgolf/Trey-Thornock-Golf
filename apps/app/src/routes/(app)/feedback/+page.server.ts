import { feedbackEnabled } from '#lib/server/feedback-flag';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

// TEMPORARY dev tool (docs/system/feedback.md): with the flag off the page does not exist.
export const load: PageServerLoad = () => {
	if (!feedbackEnabled) error(404, 'Not found');
	return {};
};
