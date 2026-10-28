import { dev } from '$app/env';
import { error } from '@sveltejs/kit';
import { MOCK_COACH_ID, MOCK_PLAYER_ID } from '../mock-api/feedback-store';
import type { PageServerLoad } from './$types';

// Dev-only preview of the feedback tickets without Clerk or Postgres (in-memory mock API): /dev/feedback?role=coach
export const load: PageServerLoad = ({ url }) => {
	if (!dev) error(404, 'Not found');
	const role = url.searchParams.get('role') === 'coach' ? ('coach' as const) : ('player' as const);
	return { role, userId: role === 'coach' ? MOCK_COACH_ID : MOCK_PLAYER_ID };
};
