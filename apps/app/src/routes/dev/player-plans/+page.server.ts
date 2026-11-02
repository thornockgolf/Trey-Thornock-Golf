import { dev } from '$app/env';
import { error } from '@sveltejs/kit';
import { PHASES, SESSIONS, dayOffset } from '@ttg/db';
import { addDays, type LoggedSessionDto, type PhaseDto, type PlanSessionDto, type PlansPageDto } from '@ttg/shared';
import { localDate } from '#lib/plans/sessions';
import { mockFavorites, mockSession, seedMockSessions } from '../mock-api/plan-store';
import { mockVideoDto, seedVideo } from '../mock-api/mock-store';
import type { PageServerLoad } from './$types';

// Dev-only preview of the player's /plans page with the 90-day plan, no Clerk session or Postgres:
//   /dev/player-plans              lesson 16 is today (middle of phase 2)
//   /dev/player-plans?lesson=1     start of the plan
//   /dev/player-plans?lesson=30    phase 3
//   /dev/player-plans?plain=1      the same sessions without phases (no phase cards: Today / Coming up)
//   /dev/player-plans?today=2026-11-02  tell the page what 'today' is (default: the browser's local day): sessions dated
//                                  before it go to History, today and later stay on top. Stars persist in the mock until restart.
const poster = (a: string) =>
	`data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 90"><rect width="160" height="90" fill="${a}"/></svg>`)}`;

export const load: PageServerLoad = ({ url }) => {
	if (!dev) error(404, 'Not found');
	const asked = url.searchParams.get('today');
	const today = asked && addDays(asked, 0) ? asked : localDate();
	const lesson = Math.min(39, Math.max(1, Number(url.searchParams.get('lesson') ?? 16)));
	const start = addDays(today, -dayOffset(lesson - 1))!;
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
			completedAt: finished ? done : null,
			tags: s.tags
		};
	});
	// The mock API keeps the sessions (check-offs and drill videos survive a reload) and a small video library to pick from.
	seedMockSessions(sessions);
	const lib = (id: string, title: string, color: string, status: 'ready' | 'processing', createdAt: string) =>
		mockVideoDto(id) ??
		seedVideo({ id, kind: 'swing', status, title, errorCode: null, durationMs: 6200, fps: 60, width: 1280, height: 720, sizeBytes: 1, createdAt, posterUrl: poster(color) });
	lib('11111111-1111-4111-8111-111111111111', 'Driver, face on', '#7fb3d5', 'ready', '2026-10-30T15:00:00Z');
	lib('22222222-2222-4222-8222-222222222222', '7 iron, down the line', '#e8c37a', 'ready', '2026-10-20T15:00:00Z');
	lib('33333333-3333-4333-8333-333333333333', 'Wedge, still processing', '#cccccc', 'processing', '2026-11-01T15:00:00Z');
	const plain = url.searchParams.has('plain');
	const phases: PhaseDto[] = plain ? [] : PHASES.map((p) => ({ id: p.id, title: p.title, description: p.description, measure: p.measure ?? null, fromLesson: p.fromLesson, toLesson: p.toLesson }));
	const logged: LoggedSessionDto[] = [
		{ id: 'l1', playerId: 'p', date: addDays(today, -1)!, tags: ['skill', 'situational'], minutes: 45, workedOn: 'Played nine holes, tracked up-and-downs', drills: [{ id: 'd1', name: 'Up-and-Down Challenge' }], notes: 'Chipped well, three-putted twice. Need to work on lag putting.', video: { id: 'v1', status: 'ready', title: null }, createdAt: '2026-11-01T18:00:00Z' },
		{ id: 'l2', playerId: 'p', date: addDays(today, -3)!, tags: ['mechanical'], minutes: null, workedOn: 'Grip pressure, extra day', drills: [], notes: null, video: { id: 'v2', status: 'processing', title: null }, createdAt: '2026-10-30T18:00:00Z' }
	];
	const page: PlansPageDto & { today: string } = { today, favorites: mockFavorites(), sessions: sessions.map((x) => mockSession(x.id) ?? x), phases, lessonBySession: plain ? {} : Object.fromEntries(sessions.map((s, n) => [s.id, n + 1])), logged };
	return page;
};
