/**
 * Dev-only in-memory stand-in for the coach APIs (drills, plans, players, notes), so the coach screens can be driven
 * without Clerk or Postgres. Uses the real request schemas and the real rules (session totals, dates). Lost on restart.
 */
import { dev } from '$app/env';
import { error, json } from '@sveltejs/kit';
import {
	AddNoteRequest,
	PhotoUploadRequest,
	UpdateProfileRequest,
	type ProfileDto,
	CreateAssessmentRequest,
	RecordResultRequest,
	ScheduleAssessmentRequest,
	ScheduleCheckInRequest,
	SubmitCheckInRequest,
	trendOf,
	type AssessmentDto,
	type AssessmentResultDto,
	type CheckInDto,
	AssignPlanRequest,
	CreateDrillRequest,
	CreatePlanRequest,
	UpdateDrillRequest,
	UpdatePlanRequest,
	addDays,
	sessionTotalIssues,
	type CoachNoteDto,
	type DrillDto,
	type PlanAssignmentDto,
	type PlanDto,
	type PlayerSummaryDto
} from '@ttg/shared';
import { Schema } from 'effect';

const now = () => new Date().toISOString();
const fail = (status: number, code: string, message: string) => json({ code, message }, { status });
const decode = <S extends Schema.Decoder<unknown, never>>(schema: S, body: unknown): S['Type'] | undefined => {
	try {
		return Schema.decodeUnknownSync(schema)(body) as S['Type'];
	} catch {
		return undefined;
	}
};

const drill = (id: string, name: string, category: string, defaultMinutes: number, extra: Partial<DrillDto> = {}): DrillDto => ({
	id, name, category, defaultMinutes, purpose: null, setup: null, steps: [], cues: null, successCriteria: null, commonMistake: null, progression: null, regression: null, updatedAt: now(), ...extra
});
const D = (n: number) => `00000000-0000-4000-8000-00000000d${String(n).padStart(3, '0')}`;
const drills: DrillDto[] = [
	drill(D(1), 'Gate drill', 'Putting', 10, { purpose: 'Square face at impact', steps: ['Set two tees a putter-head wide', 'Roll 10 putts through the gate'] }),
	drill(D(2), 'Ladder putting', 'Putting', 15),
	drill(D(3), '9 ball flight', 'Full swing', 20),
	drill(D(4), 'Pump drill', 'Full swing', 10),
	drill(D(5), 'Landing spot wedges', 'Short game', 15),
	drill(D(6), 'Up and down game', 'Short game', 20),
	drill(D(7), 'Tempo 3:1', 'Full swing', 10),
	drill(D(8), 'Pre-shot routine', 'Mental', 5)
];
const plans: PlanDto[] = [
	{
		id: '00000000-0000-4000-8000-00000000a001', authorId: 'coach', title: 'Short game, week 1', createdAt: now(), updatedAt: now(),
		structure: { v: 1, sessions: [{ title: 'Putting basics', durationMin: 30, items: [{ drillId: D(1), minutes: 10 }, { drillId: D(2), minutes: 20 }] }] }
	}
];
const P = (n: number) => `00000000-0000-4000-8000-00000000b${String(n).padStart(3, '0')}`;
const players: PlayerSummaryDto[] = [
	{ id: P(1), displayName: 'Sam Rivera', email: 'sam@example.com', assigned: true, joinedAt: '2026-09-01T12:00:00Z', newVideos: 2, lastVideoAt: '2026-10-10T15:00:00Z', upcomingSessions: 3, completedSessions: 4, hasQuestionnaire: true, unreadMessages: 2 },
	{ id: P(2), displayName: null, email: 'jo@example.com', assigned: true, joinedAt: '2026-09-20T12:00:00Z', newVideos: 0, lastVideoAt: null, upcomingSessions: 0, completedSessions: 0, hasQuestionnaire: false, unreadMessages: 0 },
	{ id: P(3), displayName: 'Pat Lee', email: null, assigned: false, joinedAt: '2026-10-11T12:00:00Z', newVideos: 0, lastVideoAt: null, upcomingSessions: 0, completedSessions: 0, hasQuestionnaire: false, unreadMessages: 0 }
];
const notes = new Map<string, CoachNoteDto[]>();
const assessments: AssessmentDto[] = [{ id: '00000000-0000-4000-8000-00000000c001', name: '7 iron carry', description: null, unit: 'yd' }];
const checkIns: CheckInDto[] = [];
const results: AssessmentResultDto[] = [];
export const seedCheckIns = () => checkIns;
export const seedResults = () => results;
export const seedAssessments = () => assessments;

/** Serve one request. `path` is what follows `/dev/mock-api/`. Returns undefined for paths this store does not know. */
export const handle = (method: string, path: string, body: unknown): Response | undefined => {
	if (!dev) error(404, 'Not found');
	const seg = path.split('/').filter(Boolean);

	if (seg[0] === 'drills') {
		if (seg.length === 1 && method === 'GET') return json({ drills });
		if (seg.length === 1 && method === 'POST') {
			const b = decode(CreateDrillRequest, body);
			if (!b) return fail(422, 'ValidationError', 'Invalid request');
			if (drills.some((d) => d.name === b.name)) return fail(409, 'Conflict', 'A drill with that name already exists');
			const d = drill(crypto.randomUUID(), b.name, b.category ?? '', b.defaultMinutes ?? 10, { ...b, category: b.category ?? null, steps: b.steps ?? [], updatedAt: now() } as Partial<DrillDto>);
			drills.push(d);
			return json(d);
		}
		if (seg.length === 2 && method === 'PATCH') {
			const i = drills.findIndex((d) => d.id === seg[1]);
			const b = decode(UpdateDrillRequest, body);
			if (i < 0) return fail(404, 'NotFound', 'Drill not found');
			if (!b) return fail(422, 'ValidationError', 'Invalid request');
			drills[i] = { ...drills[i]!, ...(b as Partial<DrillDto>), updatedAt: now() };
			return json(drills[i]);
		}
	}

	if (seg[0] === 'plans') {
		if (seg.length === 1 && method === 'GET') return json({ plans });
		if (seg.length === 1 && method === 'POST') {
			const b = decode(CreatePlanRequest, body);
			if (!b) return fail(422, 'ValidationError', 'Invalid request');
			if (sessionTotalIssues(b.structure).length > 0) return fail(422, 'ValidationError', 'Invalid request: check structure');
			const p: PlanDto = { id: crypto.randomUUID(), authorId: 'coach', title: b.title, structure: b.structure, createdAt: now(), updatedAt: now() };
			plans.unshift(p);
			return json(p);
		}
		if (seg.length === 2 && method === 'PATCH') {
			const i = plans.findIndex((p) => p.id === seg[1]);
			const b = decode(UpdatePlanRequest, body);
			if (i < 0) return fail(404, 'NotFound', 'Plan not found');
			if (!b) return fail(422, 'ValidationError', 'Invalid request');
			if (b.structure && sessionTotalIssues(b.structure).length > 0) return fail(422, 'ValidationError', 'Invalid request: check structure');
			plans[i] = { ...plans[i]!, title: b.title ?? plans[i]!.title, structure: b.structure ?? plans[i]!.structure, updatedAt: now() };
			return json(plans[i]);
		}
		if (seg.length === 3 && seg[2] === 'assign' && method === 'POST') {
			const plan = plans.find((p) => p.id === seg[1]);
			const b = decode(AssignPlanRequest, body);
			if (!plan) return fail(404, 'NotFound', 'Plan not found');
			if (!b) return fail(422, 'ValidationError', 'Invalid request');
			const player = players.find((p) => p.id === b.playerId);
			if (!player?.assigned) return fail(403, 'Forbidden', 'Not allowed');
			const spacing = b.spacingDays ?? 1;
			const dates = plan.structure.sessions.map((_, n) => addDays(b.startsOn, n * spacing));
			if (dates.some((d) => d === null)) return fail(422, 'ValidationError', 'Invalid request: check startsOn');
			const a: PlanAssignmentDto = {
				id: crypto.randomUUID(), planId: plan.id, playerId: b.playerId, startsOn: b.startsOn, status: 'active',
				sessions: plan.structure.sessions.map((s, n) => ({
					id: crypto.randomUUID(), assignmentId: 'x', title: s.title, planTitle: plan.title, scheduledOn: dates[n]!, durationMin: s.durationMin, completedAt: null,
					items: s.items.map((it) => ({ id: crypto.randomUUID(), drillId: it.drillId, name: drills.find((d) => d.id === it.drillId)?.name ?? 'Drill', minutes: it.minutes, completedAt: null }))
				}))
			};
			return json(a);
		}
	}

	if (seg[0] === 'profile-photo' && method === 'PUT') return new Response(null, { status: 200 });
	if (seg[0] === 'profile') {
		if (seg.length === 1 && method === 'GET') return json(profile);
		if (seg.length === 1 && method === 'PUT') {
			const b = decode(UpdateProfileRequest, body);
			if (!b) return fail(422, 'ValidationError', 'Invalid request: check handicap');
			const clean = (v: string | null | undefined) => (v === undefined ? undefined : v === null || v.trim() === '' ? null : v.trim());
			Object.assign(profile, {
				...(b.displayName !== undefined && { displayName: clean(b.displayName) }),
				...(b.handicap !== undefined && { handicap: b.handicap }),
				...(b.goals !== undefined && { goals: clean(b.goals) }),
				...(b.homeCourse !== undefined && { homeCourse: clean(b.homeCourse) }),
				...(b.hand !== undefined && { hand: b.hand }),
				...(b.equipment !== undefined && { equipment: clean(b.equipment) }),
				...(b.limitations !== undefined && { limitations: clean(b.limitations) })
			});
			return json(profile);
		}
		if (seg[1] === 'photo' && seg.length === 2 && method === 'POST') {
			const b = decode(PhotoUploadRequest, body);
			if (!b) return fail(422, 'ValidationError', 'Invalid request: check contentType, sizeBytes');
			return json({ upload: { url: '/dev/mock-api/profile-photo', headers: { 'Content-Type': b.contentType }, expiresAt: now() } });
		}
		if (seg[1] === 'photo' && seg[2] === 'complete' && method === 'POST') {
			profile.photoUrl = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" fill="#7fb3d5"/><circle cx="48" cy="38" r="16" fill="#fff"/><rect x="22" y="58" width="52" height="30" rx="14" fill="#fff"/></svg>')}`;
			return json(profile);
		}
	}

	if (seg[0] === 'check-ins') {
		if (seg.length === 1 && method === 'GET') return json({ checkIns });
		if (seg.length === 1 && method === 'POST') {
			const b = decode(ScheduleCheckInRequest, body);
			if (!b) return fail(422, 'ValidationError', 'Invalid request');
			const dates = Array.from({ length: 1 + (b.repeatWeeks ?? 0) }, (_, n) => addDays(b.scheduledOn, n * 7));
			if (dates.some((d) => d === null)) return fail(422, 'ValidationError', 'Invalid request: check scheduledOn');
			const made = dates.map((d): CheckInDto => ({ id: crypto.randomUUID(), playerId: b.playerId, scheduledOn: d!, answers: null, submittedAt: null }));
			checkIns.push(...made);
			return json({ checkIns: made });
		}
		if (seg.length === 2 && method === 'PATCH') {
			const i = checkIns.findIndex((c) => c.id === seg[1]);
			const b = decode(SubmitCheckInRequest, body);
			if (i < 0) return fail(404, 'NotFound', 'Check-in not found');
			if (!b) return fail(422, 'ValidationError', 'Invalid request');
			if (checkIns[i]!.submittedAt) return fail(409, 'Conflict', 'You already submitted this check-in');
			checkIns[i] = { ...checkIns[i]!, answers: b.answers, submittedAt: now() };
			return json(checkIns[i]);
		}
	}

	if (seg[0] === 'assessments') {
		if (seg.length === 1 && method === 'GET') return json({ assessments });
		if (seg.length === 1 && method === 'POST') {
			const b = decode(CreateAssessmentRequest, body);
			if (!b) return fail(422, 'ValidationError', 'Invalid request');
			if (assessments.some((a) => a.name === b.name)) return fail(409, 'Conflict', 'A test with that name already exists');
			const a: AssessmentDto = { id: crypto.randomUUID(), name: b.name, description: b.description ?? null, unit: b.unit ?? null };
			assessments.push(a);
			return json(a);
		}
		const test = assessments.find((a) => a.id === seg[1]);
		if (seg.length === 3 && seg[2] === 'schedule' && method === 'POST') {
			const b = decode(ScheduleAssessmentRequest, body);
			if (!test) return fail(404, 'NotFound', 'Test not found');
			if (!b || addDays(b.scheduledOn, 0) === null) return fail(422, 'ValidationError', 'Invalid request');
			const r: AssessmentResultDto = { id: crypto.randomUUID(), assessmentId: test.id, name: test.name, unit: test.unit, date: b.scheduledOn, value: null, recordedAt: null, previousValue: null, change: null, trend: null };
			results.push(r);
			return json(r);
		}
		if (seg.length === 3 && seg[2] === 'results' && method === 'POST') {
			const b = decode(RecordResultRequest, body);
			if (!test) return fail(404, 'NotFound', 'Test not found');
			if (!b) return fail(422, 'ValidationError', 'Invalid request');
			const i = results.findIndex((r) => r.id === b.resultId && r.value === null);
			if (i < 0) return fail(404, 'NotFound', 'Test or scheduled result not found');
			const previous = [...results].filter((r) => r.assessmentId === test.id && r.value !== null && r.date <= results[i]!.date).sort((x, y) => (x.date < y.date ? 1 : -1))[0]?.value ?? null;
			results[i] = { ...results[i]!, value: b.value, recordedAt: now(), previousValue: previous, ...trendOf(b.value, previous) };
			return json(results[i]);
		}
	}

	if (seg[0] === 'players') {
		if (seg.length === 1 && method === 'GET') return json({ players });
		const i = players.findIndex((p) => p.id === seg[1]);
		if (seg.length === 3 && seg[2] === 'assign' && method === 'POST') {
			if (i < 0) return fail(404, 'NotFound', 'Player not found');
			players[i] = { ...players[i]!, assigned: true };
			return json({ ok: true });
		}
		if (seg.length === 3 && seg[2] === 'unassign' && method === 'POST') {
			if (i < 0 || !players[i]!.assigned) return fail(404, 'NotFound', 'Player not found');
			players[i] = { ...players[i]!, assigned: false };
			return json({ ok: true });
		}
		if (seg.length === 3 && seg[2] === 'delete' && method === 'POST') {
			if (i < 0) return fail(404, 'NotFound', 'Player not found');
			players.splice(i, 1);
			return json({ ok: true });
		}
		if (seg.length === 3 && seg[2] === 'notes') {
			if (i < 0) return fail(404, 'NotFound', 'Player not found');
			if (!players[i]!.assigned) return fail(403, 'Forbidden', 'Not allowed');
			if (method === 'GET') return json({ notes: notes.get(seg[1]!) ?? [] });
			if (method === 'POST') {
				const b = decode(AddNoteRequest, body);
				if (!b) return fail(422, 'ValidationError', 'Invalid request: check body');
				const n: CoachNoteDto = { id: crypto.randomUUID(), body: b.body.trim(), createdAt: now() };
				notes.set(seg[1]!, [n, ...(notes.get(seg[1]!) ?? [])]);
				return json(n);
			}
		}
	}
	return undefined;
};

const profile: { -readonly [K in keyof ProfileDto]: ProfileDto[K] } = {
	userId: 'me', displayName: 'Sam Rivera', email: 'sam@example.com', handicap: 14.5, goals: 'Break 90 consistently', homeCourse: 'Duke Golf Club', hand: 'right',
	equipment: null, limitations: null, photoUrl: null, summary: { videos: 3, plan: { title: 'Short game, week 1', sessions: 6, sessionsDone: 2 }, subscriptionStatus: null }
};
export const seedProfile = () => profile;
export const seedPlayers = () => players;
export const seedDrills = () => drills;
export const seedPlans = () => plans;
