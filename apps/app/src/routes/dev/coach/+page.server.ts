import { dev } from '$app/env';
import { error } from '@sveltejs/kit';
import { seedPlayers } from '../mock-api/coach-store';
import type { PageServerLoad } from './$types';

// Dev-only preview of the coach dashboard without a Clerk session or Postgres (in-memory mock API):
//   /dev/coach          two players, one more waiting to be added      /dev/coach?state=empty   no players at all
export const load: PageServerLoad = ({ url }) => {
	if (!dev) error(404, 'Not found');
	return { players: url.searchParams.get('state') === 'empty' ? [] : seedPlayers() };
};
