import { dev } from '$app/env';
import { error } from '@sveltejs/kit';
import type { PlanSessionDto, QuestionnaireResponseDto, VideoDto } from '@ttg/shared';
import { seedAssessments, seedCheckIns, seedPlayers, seedProfile, seedResults } from '../mock-api/coach-store';
import type { PageServerLoad } from './$types';

const poster = (a: string, b: string) =>
	`data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 90"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="160" height="90" fill="url(#g)"/></svg>`)}`;

// Dev-only preview of a coach's player page with sample data: /dev/coach-player
export const load: PageServerLoad = () => {
	if (!dev) error(404, 'Not found');
	const player = seedPlayers()[0]!;
	const video = (id: string, title: string, a: string): VideoDto => ({
		id, kind: 'swing', status: 'ready', title, errorCode: null, durationMs: 6200, fps: 60, width: 1280, height: 720, sizeBytes: 1, createdAt: '2026-10-10T15:00:00Z', posterUrl: poster(a, '#2e7d4f')
	});
	const questionnaire: QuestionnaireResponseDto = {
		id: 'q', userId: player.id, version: 2, formVersion: 1, completedAt: '2026-09-02T12:00:00Z', updatedAt: '2026-09-02T12:00:00Z',
		answers: { handicap: 14, experience: '3to10', ballFlight: ['slice'], contact: ['fat'], missDriver: 'right', missIrons: 'left', missWedges: 'short', whenMiss: ['driver', 'pressure'], limitations: ['none'] }
	};
	const session = (n: number, done: boolean[], completedAt: string | null): PlanSessionDto => ({
		id: `s${n}`, assignmentId: 'a', title: `Session ${n}`, planTitle: 'Short game, week 1', scheduledOn: `2026-10-${10 + n}`, durationMin: 30, completedAt,
		items: done.map((d, i) => ({ id: `i${n}${i}`, drillId: 'd', name: 'Drill', minutes: 15, completedAt: d ? '2026-10-12T10:00:00Z' : null }))
	});
	return {
		player,
		questionnaire,
		videos: [video('v1', 'Driver, face on', '#7fb3d5'), video('v2', '7 iron, down the line', '#e8c37a')],
		sessions: [session(1, [true, true], '2026-10-11T10:00:00Z'), session(2, [true, false], null), session(3, [false, false], null)],
		assessments: seedAssessments(),
		profile: seedProfile(),
		calendar: {
			sessions: [session(1, [true, true], '2026-10-11T10:00:00Z'), session(2, [true, false], null), session(3, [false, false], null)],
			checkIns: seedCheckIns(),
			results: seedResults()
		}
	};
};
