import { dev } from '$app/env';
import { error } from '@sveltejs/kit';
import type { CalendarData, PlanSessionDto } from '@ttg/shared';
import { seedCheckIns, seedResults } from '../mock-api/coach-store';
import type { PageServerLoad } from './$types';

// Dev-only preview of the player's calendar without a Clerk session or Postgres (in-memory mock API).
// Dates are relative to today so the preview always has something this week:  /dev/calendar
export const load: PageServerLoad = () => {
	if (!dev) error(404, 'Not found');
	const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
	const session = (n: number, offset: number, done: boolean): PlanSessionDto => ({
		id: `s${n}`, assignmentId: 'a', title: `Session ${n}`, planTitle: 'Short game, week 1', scheduledOn: day(offset), durationMin: 30, completedAt: done ? new Date().toISOString() : null,
		items: [0, 1].map((i) => ({ id: `i${n}${i}`, drillId: 'd', name: 'Drill', minutes: 15, completedAt: done ? new Date().toISOString() : null }))
	});
	if (seedCheckIns().length === 0) {
		seedCheckIns().push({ id: 'c-open', playerId: 'p', scheduledOn: day(1), answers: null, submittedAt: null });
		seedCheckIns().push({ id: 'c-done', playerId: 'p', scheduledOn: day(-6), answers: { roundsPlayed: 2, confidence: 4, issues: 'Pulled my irons' }, submittedAt: new Date().toISOString() });
	}
	if (seedResults().length === 0) {
		const base = { assessmentId: 'a', name: '7 iron carry', unit: 'yd', recordedAt: new Date().toISOString() };
		seedResults().push({ ...base, id: 'r1', date: day(-14), value: 140, previousValue: null, change: null, trend: null });
		seedResults().push({ ...base, id: 'r2', date: day(-3), value: 147, previousValue: 140, change: 7, trend: 'up' });
		seedResults().push({ ...base, id: 'r3', date: day(2), value: null, recordedAt: null, previousValue: null, change: null, trend: null });
	}
	const calendar: CalendarData = { sessions: [session(1, -2, true), session(2, 0, false), session(3, 3, false)], checkIns: [...seedCheckIns()], results: [...seedResults()] };
	return { calendar, videos: [{ id: 'v1', title: 'Driver, face on' }] };
};
