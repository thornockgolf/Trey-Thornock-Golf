import { dev } from '$app/env';
import { error } from '@sveltejs/kit';
import { seedDrills, seedPlans, seedPlayers } from '../mock-api/coach-store';
import type { PageServerLoad } from './$types';

// Dev-only preview of the coach plan composer without a Clerk session or Postgres, against an in-memory mock API:
//   /dev/plans            plans, drills, and two assigned players
export const load: PageServerLoad = () => {
	if (!dev) error(404, 'Not found');
	return { plans: seedPlans(), drills: seedDrills(), players: seedPlayers().filter((p) => p.assigned) };
};
