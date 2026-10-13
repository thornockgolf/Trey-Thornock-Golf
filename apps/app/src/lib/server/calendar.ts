import { Assessments, CheckIns, Plans, Videos, type AssessmentResult, type CheckIn } from '@ttg/db';
import {
	CreateAssessmentRequest,
	RecordResultRequest,
	ScheduleAssessmentRequest,
	ScheduleCheckInRequest,
	SubmitCheckInRequest,
	addDays,
	type AssessmentDto,
	type AssessmentResultDto,
	type CalendarData,
	type CheckInDto,
	type CurrentUserData
} from '@ttg/shared';
import { Effect } from 'effect';
import { currentUser, requireRole } from './auth';
import { decodeBody } from './decode';
import { Conflict, Forbidden, NotFound, ValidationError } from './errors';
import { assignedPlayer } from './players';
import { toSessionDto } from './plans';
import { RequestContext } from './request-context';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const idParam = (what: string) =>
	Effect.gen(function* () {
		const { event } = yield* RequestContext;
		const id = event.params.id ?? '';
		if (!UUID.test(id)) return yield* new NotFound({ message: `${what} not found` });
		return id;
	});

export const toCheckInDto = (c: CheckIn): CheckInDto => ({
	id: c.id,
	playerId: c.playerId,
	scheduledOn: c.scheduledOn,
	answers: c.answers,
	submittedAt: c.submittedAt?.toISOString() ?? null
});

export const toResultDto = (r: AssessmentResult): AssessmentResultDto => ({
	id: r.id,
	assessmentId: r.assessmentId,
	name: r.name,
	unit: r.unit,
	date: r.date,
	value: r.value,
	recordedAt: r.recordedAt?.toISOString() ?? null,
	previousValue: r.previousValue,
	change: r.change,
	trend: r.trend
});

/**
 * Whose data a request is about: a player reads their own; a coach names an assigned player with `?playerId=`
 * (403 for anyone else, 422 when the coach names no one).
 */
const subject = (user: CurrentUserData) =>
	Effect.gen(function* () {
		if (user.role === 'player') return user.id;
		const { event } = yield* RequestContext;
		const playerId = event.url.searchParams.get('playerId') ?? '';
		if (!UUID.test(playerId)) return yield* new ValidationError({ message: 'Invalid request: check playerId' });
		yield* assignedPlayer(user.id, playerId);
		return playerId;
	});

const dateOk = (iso: string) => addDays(iso, 0) !== null;

/** `GET /api/calendar`: a player's sessions, check-ins and tests (coaches add `?playerId=` for an assigned player). */
export const getCalendar = Effect.gen(function* () {
	const user = yield* currentUser;
	const playerId = yield* subject(user);
	const [sessions, checkIns, results] = yield* Effect.all([
		(yield* Plans).listSessionsForPlayer(playerId),
		(yield* CheckIns).listForPlayer(playerId),
		(yield* Assessments).resultsForPlayer(playerId)
	]);
	return {
		sessions: sessions.map(toSessionDto),
		checkIns: checkIns.map(toCheckInDto),
		results: results.map(toResultDto)
	} satisfies CalendarData;
});

/** `GET /api/check-ins`: the same scoping as the calendar. */
export const listCheckIns = Effect.gen(function* () {
	const user = yield* currentUser;
	const playerId = yield* subject(user);
	return { checkIns: (yield* (yield* CheckIns).listForPlayer(playerId)).map(toCheckInDto) };
});

/** `POST /api/check-ins`: a coach schedules a check-in for an assigned player, optionally repeating weekly. */
export const scheduleCheckIn = Effect.gen(function* () {
	const coach = yield* requireRole('coach');
	const body = yield* decodeBody(ScheduleCheckInRequest);
	if (!dateOk(body.scheduledOn)) return yield* new ValidationError({ message: 'Invalid request: check scheduledOn' });
	const dates = Array.from({ length: 1 + (body.repeatWeeks ?? 0) }, (_, n) => addDays(body.scheduledOn, n * 7)!);
	const result = yield* (yield* CheckIns).schedule({ coachId: coach.id, playerId: body.playerId, dates });
	if (result._tag === 'NotPaired') return yield* new Forbidden({ message: 'Not allowed' });
	return { checkIns: result.checkIns.map(toCheckInDto) };
});

/** `PATCH /api/check-ins/:id`: the player submits their own check-in, once. A video named must be theirs. */
export const submitCheckIn = Effect.gen(function* () {
	const player = yield* requireRole('player');
	const body = yield* decodeBody(SubmitCheckInRequest);
	const id = yield* idParam('Check-in');
	if (body.answers.videoId) {
		const video = yield* (yield* Videos).find(body.answers.videoId);
		if (!video || video.ownerId !== player.id) return yield* new ValidationError({ message: 'Invalid request: check videoId' });
	}
	const result = yield* (yield* CheckIns).submit({ playerId: player.id, id, answers: body.answers });
	if (result._tag === 'Missing') return yield* new NotFound({ message: 'Check-in not found' });
	if (result._tag === 'AlreadySubmitted') return yield* new Conflict({ message: 'You already submitted this check-in' });
	return toCheckInDto(result.checkIn);
});

const toAssessmentDto = (a: { id: string; name: string; description: string | null; unit: string | null }): AssessmentDto => ({
	id: a.id,
	name: a.name,
	description: a.description,
	unit: a.unit
});

/** `GET /api/assessments`: a coach sees every test; a player only the ones they have a result or schedule for. */
export const listAssessments = Effect.gen(function* () {
	const user = yield* currentUser;
	const assessments = yield* Assessments;
	const rows = user.role === 'coach' ? yield* assessments.list() : yield* assessments.listForPlayer(user.id);
	return { assessments: rows.map(toAssessmentDto) };
});

/** `POST /api/assessments`: a coach defines a test. */
export const createAssessment = Effect.gen(function* () {
	yield* requireRole('coach');
	const body = yield* decodeBody(CreateAssessmentRequest);
	const result = yield* (yield* Assessments).define({ name: body.name.trim(), description: body.description?.trim() || null, unit: body.unit?.trim() || null });
	if (result._tag === 'NameTaken') return yield* new Conflict({ message: 'A test with that name already exists' });
	return toAssessmentDto(result.assessment);
});

/** `POST /api/assessments/:id/schedule`: a coach puts a test on an assigned player's calendar. */
export const scheduleAssessment = Effect.gen(function* () {
	const coach = yield* requireRole('coach');
	const body = yield* decodeBody(ScheduleAssessmentRequest);
	const id = yield* idParam('Test');
	if (!dateOk(body.scheduledOn)) return yield* new ValidationError({ message: 'Invalid request: check scheduledOn' });
	const result = yield* (yield* Assessments).schedule({ coachId: coach.id, playerId: body.playerId, assessmentId: id, scheduledOn: body.scheduledOn });
	if (result._tag === 'NotPaired') return yield* new Forbidden({ message: 'Not allowed' });
	if (result._tag === 'Missing') return yield* new NotFound({ message: 'Test not found' });
	return toResultDto(result.result);
});

/** `POST /api/assessments/:id/results`: a coach records a value (for a scheduled test, or ad hoc). The player is notified. */
export const recordResult = Effect.gen(function* () {
	const coach = yield* requireRole('coach');
	const body = yield* decodeBody(RecordResultRequest);
	const id = yield* idParam('Test');
	const result = yield* (yield* Assessments).record({ coachId: coach.id, playerId: body.playerId, assessmentId: id, value: body.value, resultId: body.resultId });
	if (result._tag === 'NotPaired') return yield* new Forbidden({ message: 'Not allowed' });
	if (result._tag === 'Missing') return yield* new NotFound({ message: 'Test or scheduled result not found' });
	return toResultDto(result.result);
});

/** `GET /api/assessments/:id/results`: one test's results over time for a player (own, or an assigned player's for a coach). */
export const listResults = Effect.gen(function* () {
	const user = yield* currentUser;
	const playerId = yield* subject(user);
	const id = yield* idParam('Test');
	return { results: (yield* (yield* Assessments).resultsForPlayer(playerId, id)).map(toResultDto) };
});

/** Data for `/calendar` (players): their calendar, and their ready videos to link in a check-in. */
export const calendarPageData = Effect.gen(function* () {
	const player = yield* requireRole('player');
	const [sessions, checkIns, results, videos] = yield* Effect.all([
		(yield* Plans).listSessionsForPlayer(player.id),
		(yield* CheckIns).listForPlayer(player.id),
		(yield* Assessments).resultsForPlayer(player.id),
		(yield* Videos).listByOwner(player.id)
	]);
	return {
		calendar: { sessions: sessions.map(toSessionDto), checkIns: checkIns.map(toCheckInDto), results: results.map(toResultDto) } satisfies CalendarData,
		videos: videos.filter((v) => v.status === 'ready').map((v) => ({ id: v.id, title: v.title?.trim() || `Swing ${v.createdAt.toISOString().slice(0, 10)}` }))
	};
});
