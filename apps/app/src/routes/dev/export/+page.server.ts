import { dev } from '$app/env';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

// Dev-only preview of the analysis export panel: /dev/export. It calls /dev/mock-api/analyses/<id>/export; the
// states are driven from the browser (the page is a plain component with stubbed requests in its test run).
export const load: PageServerLoad = () => {
	if (!dev) error(404, 'Not found');
	return {};
};
