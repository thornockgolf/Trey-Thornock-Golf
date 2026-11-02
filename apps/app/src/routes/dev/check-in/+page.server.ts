import { dev } from '$app/env';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = () => {
	if (!dev) error(404, 'Not found');
	return {};
};
