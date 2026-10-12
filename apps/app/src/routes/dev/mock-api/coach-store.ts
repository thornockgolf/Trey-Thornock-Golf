/**
 * Dev-only in-memory stand-in for the coach APIs (drills, plans, players, notes), so the coach screens can be driven
 * without Clerk or Postgres. Uses the real request schemas and the real rules (session totals, dates). Lost on restart.
 */
import { dev } from '$app/env';
import { error, json } from '@sveltejs/kit';
import {
	AddNoteRequest,
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
	{ id: P(1), displayName: 'Sam Rivera', email: 'sam@example.com', assigned: true, joinedAt: '2026-09-01T12:00:00Z', newVideos: 2, lastVideoAt: '2026-10-10T15:00:00Z', upcomingSessions: 3, completedSessions: 4, hasQuestionnaire: true },
	{ id: P(2), displayName: null, email: 'jo@example.com', assigned: true, joinedAt: '2026-09-20T12:00:00Z', newVideos: 0, lastVideoAt: null, upcomingSessions: 0, completedSessions: 0, hasQuestionnaire: false },
	{ id: P(3), displayName: 'Pat Lee', email: null, assigned: false, joinedAt: '2026-10-11T12:00:00Z', newVideos: 0, lastVideoAt: null, upcomingSessions: 0, completedSessions: 0, hasQuestionnaire: false }
];
const notes = new Map<string, CoachNoteDto[]>();

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

export const seedPlayers = () => players;
export const seedDrills = () => drills;
export const seedPlans = () => plans;
