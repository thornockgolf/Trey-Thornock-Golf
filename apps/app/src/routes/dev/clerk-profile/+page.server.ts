import { dev } from '$app/env';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

// Dev-only static APPROXIMATION of Clerk's Manage account window (not the real one), so the
// overrides in lib/clerk.css can be screenshotted without a session:
// /dev/clerk-profile?tab=profile|security&bug=1 (bug=1 re-applies the old rootBox/cardBox widths)
export const load: PageServerLoad = ({ url }) => {
	if (!dev) error(404, 'Not found');
	return { tab: url.searchParams.get('tab') === 'security' ? 'security' : 'profile', bug: url.searchParams.get('bug') === '1' };
};
