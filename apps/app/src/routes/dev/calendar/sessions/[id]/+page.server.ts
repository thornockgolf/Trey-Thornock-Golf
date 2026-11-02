import { dev } from '$app/env';
import { error } from '@sveltejs/kit';
import type { PlanSessionDto } from '@ttg/shared';
import type { PageServerLoad } from './$types';

// Dev-only preview of the session detail opened from /dev/calendar (ids s1, s2, s3; s1 is past and unfinished).
export const load: PageServerLoad = ({ params }) => {
	if (!dev) error(404, 'Not found');
	const n = Number(params.id.replace('s', ''));
	if (![1, 2, 3].includes(n)) error(404, 'Session not found');
	const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
	const session: PlanSessionDto = {
		id: params.id, assignmentId: 'a', title: ['One-piece takeaway', 'Low point control', 'Tempo'][n - 1]!, planTitle: 'Short game, week 1', scheduledOn: day([-2, 0, 3][n - 1]!), durationMin: 30, completedAt: null,
		items: [0, 1].map((i) => ({ id: `i${n}${i}`, drillId: 'd', name: ['Gate drill', 'Towel drill'][i]!, minutes: 15, completedAt: null }))
	};
	return { session };
};
