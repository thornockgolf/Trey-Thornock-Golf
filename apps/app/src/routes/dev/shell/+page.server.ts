import { dev } from '$app/env';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

// Dev-only preview of the app shell without a Clerk session: /dev/shell?role=coach&path=/coach
export const load: PageServerLoad = ({ url }) => {
	if (!dev) error(404, 'Not found');
	return {
		role: url.searchParams.get('role') === 'coach' ? ('coach' as const) : ('player' as const),
		path: url.searchParams.get('path') ?? '/'
	};
};
