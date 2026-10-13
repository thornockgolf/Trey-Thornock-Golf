import { dev } from '$app/env';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

// Dev-only preview of chat without Clerk, Postgres or Realtime (in-memory mock API): /dev/messages?as=player|coach
export const load: PageServerLoad = () => {
	if (!dev) error(404, 'Not found');
	return {};
};
