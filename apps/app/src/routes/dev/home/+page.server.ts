import { dev } from '$app/env';
import { error } from '@sveltejs/kit';
import type { HomeDto, PhaseState } from '@ttg/shared';
import type { PageServerLoad } from './$types';

// Dev-only preview of the player Home without a Clerk session or Postgres:
//   /dev/home              today's lesson, mid-plan roadmap
//   /dev/home?state=rest   next lesson is not today ("Up next")
//   /dev/home?state=done   plan finished
//   /dev/home?state=empty  no plan assigned
export const load: PageServerLoad = ({ url }) => {
	if (!dev) error(404, 'Not found');
	const state = url.searchParams.get('state');
	const today = '2026-10-28';
	const empty: HomeDto = { assignment: null, lesson: null, phases: [], currentPhaseId: null, today };
	if (state === 'empty') return { home: empty };
	const assignment = { id: 'a1', planTitle: '12-week full swing rebuild', startsOn: '2026-09-01' };
	const mk = (id: string, title: string, from: number, to: number, cur: number, measure: string | null) => ({
		id,
		title,
		description: `Why ${title.toLowerCase()} matters: it sets up everything after it, so we spend real time here before moving on.`,
		measure,
		fromLesson: from,
		toLesson: to,
		state: (to < cur ? 'done' : from <= cur ? 'current' : 'upcoming') as PhaseState
	});
	const cur = state === 'done' ? 99 : 14;
	const phases = [
		mk('p1', 'Grip, stance and posture', 1, 6, cur, 'Video check of setup at address'),
		mk('p2', 'Takeaway and backswing', 7, 18, cur, 'Club position at the top, face-on camera'),
		mk('p3', 'Transition and impact', 19, 30, cur, null),
		mk('p4', 'Short game and course play', 31, 42, cur, 'Up-and-down percentage over nine holes')
	];
	if (state === 'done') return { home: { assignment, lesson: null, phases, currentPhaseId: null, today } satisfies HomeDto };
	const item = (n: number, name: string, minutes: number, done: boolean) => ({
		id: `i${n}`, drillId: `d${n}`, name, minutes, completedAt: done ? '2026-10-28T10:00:00Z' : null
	});
	const home: HomeDto = {
		assignment,
		lesson: {
			number: 14,
			total: 42,
			completedCount: 13,
			isToday: state !== 'rest',
			session: {
				id: 's14',
				assignmentId: 'a1',
				title: 'Lead-arm connection and wide takeaway',
				planTitle: assignment.planTitle,
				scheduledOn: state === 'rest' ? '2026-10-30' : today,
				durationMin: 45,
				items: [item(1, 'Towel under the arms', 10, true), item(2, 'Pump drill, slow motion', 15, false), item(3, 'Half swings to a target', 20, false)],
				completedAt: null
			}
		},
		phases,
		currentPhaseId: 'p2',
		today
	};
	return { home };
};
