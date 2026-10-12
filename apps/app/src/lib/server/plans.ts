import { Drills, Plans, type Drill, type PlanAssignment, type PlanSessionRow, type PracticePlan } from '@ttg/db';
import {
	AssignPlanRequest,
	CreateDrillRequest,
	CreatePlanRequest,
	UpdateDrillRequest,
	SetItemCompletedRequest,
	UpdatePlanRequest,
	addDays,
	drillIdsOf,
	sessionTotalIssues,
	type DrillDto,
	type PlanAssignmentDto,
	type PlanDto,
	type PlanSessionDto,
	type PlanStructure
} from '@ttg/shared';
import { Effect } from 'effect';
import { currentUser, requireRole } from './auth';
import { decodeBody } from './decode';
import { Conflict, Forbidden, NotFound, ValidationError } from './errors';
import { RequestContext } from './request-context';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const idParam = (what: string) =>
	Effect.gen(function* () {
		const { event } = yield* RequestContext;
		const id = event.params.id ?? '';
		if (!UUID.test(id)) return yield* new NotFound({ message: `${what} not found` });
		return id;
	});

export const toDrillDto = (d: Drill): DrillDto => ({
	id: d.id,
	name: d.name,
	category: d.category,
	purpose: d.purpose,
	setup: d.setup,
	steps: d.steps,
	cues: d.cues,
	successCriteria: d.successCriteria,
	commonMistake: d.commonMistake,
	progression: d.progression,
	regression: d.regression,
	defaultMinutes: d.defaultMinutes,
	updatedAt: d.updatedAt.toISOString()
});

export const toPlanDto = (p: PracticePlan): PlanDto => ({
	id: p.id,
	authorId: p.authorId,
	title: p.title,
	structure: p.structure,
	createdAt: p.createdAt.toISOString(),
	updatedAt: p.updatedAt.toISOString()
});

const NAME_TAKEN = 'A drill with that name already exists';

/** `GET /api/drills`: the drill library. Coach only (players see drills through their assigned sessions). */
export const listDrills = Effect.gen(function* () {
	yield* requireRole('coach');
	return { drills: (yield* (yield* Drills).list()).map(toDrillDto) };
});

/** `POST /api/drills`: coach only. */
export const createDrill = Effect.gen(function* () {
	yield* requireRole('coach');
	const body = yield* decodeBody(CreateDrillRequest);
	const result = yield* (yield* Drills).create(body);
	if (result._tag !== 'Saved') return yield* new Conflict({ message: NAME_TAKEN });
	return toDrillDto(result.drill);
});

/**
 * `GET /api/drills/:id`: a coach reads any drill; a player only drills that appear in one of their sessions (anything
 * else is 403, so ids do not leak which drills exist).
 */
export const getDrill = Effect.gen(function* () {
	const user = yield* currentUser;
	const id = yield* idParam('Drill');
	if (user.role !== 'coach' && !(yield* (yield* Plans).playerHasDrill(user.id, id))) return yield* new Forbidden({ message: 'Not allowed' });
	const drill = yield* (yield* Drills).get(id);
	if (!drill) return yield* new NotFound({ message: 'Drill not found' });
	return toDrillDto(drill);
});

/** `PATCH /api/drills/:id`: coach only. */
export const updateDrill = Effect.gen(function* () {
	yield* requireRole('coach');
	const body = yield* decodeBody(UpdateDrillRequest);
	const result = yield* (yield* Drills).update(yield* idParam('Drill'), body);
	if (result._tag === 'Missing') return yield* new NotFound({ message: 'Drill not found' });
	if (result._tag === 'NameTaken') return yield* new Conflict({ message: NAME_TAKEN });
	return toDrillDto(result.drill);
});

/** A plan's sessions must each add up exactly, and may only use drills that exist. */
const checkStructure = (structure: PlanStructure) =>
	Effect.gen(function* () {
		const totals = sessionTotalIssues(structure);
		if (totals.length > 0) {
			const named = totals.map((t) => `"${t.title}" is ${t.actual} min, needs ${t.expected}`).join('; ');
			return yield* new ValidationError({ message: `Drill minutes must add up to the session length: ${named}` });
		}
		const ids = drillIdsOf(structure);
		const found = yield* (yield* Drills).existing(ids);
		if (ids.some((id) => !found.has(id))) return yield* new ValidationError({ message: 'Invalid request: check structure (unknown drill)' });
	});

/** `GET /api/plans`: coach only. */
export const listPlans = Effect.gen(function* () {
	yield* requireRole('coach');
	return { plans: (yield* (yield* Plans).list()).map(toPlanDto) };
});

/** `POST /api/plans`: coach only. */
export const createPlan = Effect.gen(function* () {
	const coach = yield* requireRole('coach');
	const body = yield* decodeBody(CreatePlanRequest);
	yield* checkStructure(body.structure);
	return toPlanDto(yield* (yield* Plans).create({ authorId: coach.id, title: body.title, structure: body.structure }));
});

/** `GET /api/plans/:id`: coach only. */
export const getPlan = Effect.gen(function* () {
	yield* requireRole('coach');
	const plan = yield* (yield* Plans).get(yield* idParam('Plan'));
	if (!plan) return yield* new NotFound({ message: 'Plan not found' });
	return toPlanDto(plan);
});

/** `PATCH /api/plans/:id`: coach only. Already-assigned sessions keep their own copy of the items. */
export const updatePlan = Effect.gen(function* () {
	yield* requireRole('coach');
	const body = yield* decodeBody(UpdatePlanRequest);
	const id = yield* idParam('Plan');
	if (body.structure) yield* checkStructure(body.structure);
	const plan = yield* (yield* Plans).update(id, body);
	if (!plan) return yield* new NotFound({ message: 'Plan not found' });
	return toPlanDto(plan);
});

export const toSessionDto = (s: PlanSessionRow): PlanSessionDto => ({
	id: s.id,
	assignmentId: s.assignmentId,
	title: s.title,
	planTitle: s.planTitle,
	scheduledOn: s.scheduledOn,
	durationMin: s.durationMin,
	items: s.items,
	completedAt: s.completedAt?.toISOString() ?? null
});

const toAssignmentDto = (a: PlanAssignment): PlanAssignmentDto => ({
	id: a.id,
	planId: a.planId,
	playerId: a.playerId,
	startsOn: a.startsOn,
	status: a.status,
	sessions: a.sessions.map(toSessionDto)
});

/** `GET /api/sessions`: the signed-in player's scheduled sessions, by date. */
export const listMySessions = Effect.gen(function* () {
	const player = yield* requireRole('player');
	return { sessions: (yield* (yield* Plans).listSessionsForPlayer(player.id)).map(toSessionDto) };
});

/** `PATCH /api/sessions/:id/items/:itemId`: the player checks one of their own drills off (or undoes it). */
export const setSessionItemCompleted = Effect.gen(function* () {
	const player = yield* requireRole('player');
	const body = yield* decodeBody(SetItemCompletedRequest);
	const { event } = yield* RequestContext;
	const sessionId = event.params.id ?? '';
	const itemId = event.params.itemId ?? '';
	if (!UUID.test(sessionId) || !UUID.test(itemId)) return yield* new NotFound({ message: 'Session not found' });
	const result = yield* (yield* Plans).setItemCompleted({ playerId: player.id, sessionId, itemId, completed: body.completed });
	if (result._tag === 'Missing') return yield* new NotFound({ message: 'Session not found' });
	return toSessionDto(result.session);
});

/**
 * `POST /api/plans/:id/assign`: coach only, and only for a player they are paired with. Creates the assignment, a
 * dated session per plan session, and a `plan_assigned` notification for the player.
 */
export const assignPlan = Effect.gen(function* () {
	const coach = yield* requireRole('coach');
	const body = yield* decodeBody(AssignPlanRequest);
	const planId = yield* idParam('Plan');
	const plans = yield* Plans;
	const plan = yield* plans.get(planId);
	if (!plan) return yield* new NotFound({ message: 'Plan not found' });
	const spacing = body.spacingDays ?? 1;
	const dates = plan.structure.sessions.map((_, n) => addDays(body.startsOn, n * spacing));
	if (dates.some((d) => d === null)) return yield* new ValidationError({ message: 'Invalid request: check startsOn' });
	const result = yield* plans.assign({ planId, coachId: coach.id, playerId: body.playerId, startsOn: body.startsOn, dates: dates as string[] });
	if (result._tag === 'NotPaired') return yield* new Forbidden({ message: 'Not allowed' });
	if (result._tag === 'PlanMissing') return yield* new NotFound({ message: 'Plan not found' });
	return toAssignmentDto(result.assignment);
});
