import { dev } from '$app/env';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

// Dev-only preview of the app shell without a Clerk session: /dev/shell?role=coach&path=/coach
export const load: PageServerLoad = ({ url }) => {
	if (!dev) error(404, 'Not found');
	return {
		role: url.searchParams.get('role') === 'coach' ? ('coach' as const) : ('player' as const),
		path: url.searchParams.get('path') ?? '/',
		// ?photo=ok shows a local image as the app photo; ?photo=bad a dead URL (the avatar must fall back)
		photoUrl: { ok: '/images/img-01.png', bad: '/nope-expired.png' }[url.searchParams.get('photo') ?? ''] ?? null
	};
};
