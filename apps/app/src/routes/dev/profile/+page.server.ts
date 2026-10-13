import { dev } from '$app/env';
import { error } from '@sveltejs/kit';
import { seedProfile } from '../mock-api/coach-store';
import type { PageServerLoad } from './$types';

// Dev-only preview of the player's profile without a Clerk session, R2 or Postgres (in-memory mock API): /dev/profile
export const load: PageServerLoad = () => {
	if (!dev) error(404, 'Not found');
	return { profile: { ...seedProfile() } };
};
