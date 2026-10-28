import { dev } from '$app/env';
import { error } from '@sveltejs/kit';
import { PHASES, SESSIONS, dayOffset } from '@ttg/db';
import { addDays, type PhaseDto, type PlanSessionDto, type PlansPageDto } from '@ttg/shared';
import { localDate } from '#lib/plans/sessions';
import type { PageServerLoad } from './$types';

// Dev-only preview of the player's /plans page with the 90-day plan, no Clerk session or Postgres:
//   /dev/player-plans              lesson 16 is today (middle of phase 2)
//   /dev/player-plans?lesson=1     start of the plan
//   /dev/player-plans?lesson=30    phase 3
//   /dev/player-plans?plain=1      the same sessions without phases (old Today / Coming up / Earlier layout)
export const load: PageServerLoad = ({ url }) => {
	if (!dev) error(404, 'Not found');
	const lesson = Math.min(39, Math.max(1, Number(url.searchParams.get('lesson') ?? 16)));
	const start = addDays(localDate(), -dayOffset(lesson - 1))!;
	const done = '2026-10-01T10:00:00.000Z';
	const sessions: PlanSessionDto[] = SESSIONS.map((s, n) => {
		const finished = n < lesson - 1 && n !== 3; // one missed session to show that state
		return {
			id: `s${n + 1}`,
			assignmentId: 'a1',
			title: s.title,
			planTitle: '90-Day Development Plan',
			scheduledOn: addDays(start, dayOffset(n))!,
			durationMin: s.durationMin,
			items: s.drills.map(([name, minutes], i) => ({ id: `s${n + 1}-i${i}`, drillId: `d${i}`, name, minutes, completedAt: finished ? done : null })),
			completedAt: finished ? done : null
		};
	});
	const plain = url.searchParams.has('plain');
	const phases: PhaseDto[] = plain ? [] : PHASES.map((p) => ({ id: p.id, title: p.title, description: p.description, measure: p.measure ?? null, fromLesson: p.fromLesson, toLesson: p.toLesson }));
	const page: PlansPageDto = { sessions, phases, lessonBySession: plain ? {} : Object.fromEntries(sessions.map((s, n) => [s.id, n + 1])) };
	return page;
};
