import { dev } from '$app/env';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

// Dev-only preview of the coach's global search without a Clerk session or Postgres: /dev/search (the coach shell, mock /api/search).
// Searches to try: "tempo" (several categories), "slcie" (typo), "rivera", "short" (a category with more), "zzz" (empty), "boom" (error), "slow".
export const load: PageServerLoad = () => {
	if (!dev) error(404, 'Not found');
	return {};
};
