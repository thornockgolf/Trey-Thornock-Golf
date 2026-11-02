import { Drills, LoggedSessions, Videos, type LoggedFields, type LoggedSession, type LoggedWrite } from '@ttg/db';
import {
	CreateLoggedSessionRequest,
	UpdateLoggedSessionRequest,
	logDateProblem,
	type CurrentUserData,
	type LoggedSessionDto
} from '@ttg/shared';
import { Effect } from 'effect';
import { currentUser, requireRole } from './auth';
import { decodeBody } from './decode';
import { NotFound, ValidationError } from './errors';
import { assignedPlayer } from './players';
import { RequestContext } from './request-context';

/**
 * Logged sessions (extra practice that is not on the plan). A player creates, edits and deletes only their own; a
 * coach only reads their assigned players'. Text-only logging is not gated more than plans are (any signed-in
 * player); the optional video is a normal upload, which is gated by the assessment where it is uploaded.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export const toLoggedDto = (l: LoggedSession): LoggedSessionDto => ({
	id: l.id,
	playerId: l.playerId,
	date: l.loggedOn,
	tags: l.tags,
	minutes: l.minutes,
	workedOn: l.workedOn,
	drills: l.drills,
	notes: l.notes,
	video: l.video,
	createdAt: l.createdAt.toISOString()
});

const idParam = Effect.gen(function* () {
	const { event } = yield* RequestContext;
	const id = event.params.id ?? '';
	if (!UUID.test(id)) return yield* new NotFound({ message: 'Session not found' });
	return id;
});

const todayIso = () => new Date().toISOString().slice(0, 10);

const blankToNull = (s: string | null | undefined) => (s === undefined ? undefined : s === null || s.trim() === '' ? null : s.trim());

/** The linked video must be one of the player's own. */
const checkVideo = (playerId: string, videoId: string | null | undefined) =>
	Effect.gen(function* () {
		if (!videoId) return;
		const video = yield* (yield* Videos).find(videoId);
		if (!video || video.ownerId !== playerId || video.kind !== 'swing') return yield* new ValidationError({ message: 'Invalid request: check videoId' });
	});

const checkDate = (date: string) =>
	Effect.gen(function* () {
		const problem = logDateProblem(date, todayIso());
		if (problem) return yield* new ValidationError({ message: problem });
	});

const saved = (result: LoggedWrite) =>
	Effect.gen(function* () {
		if (result._tag === 'Missing') return yield* new NotFound({ message: 'Session not found' });
		if (result._tag === 'UnknownDrill') return yield* new ValidationError({ message: 'Invalid request: check drillIds' });
		if (result._tag === 'Empty') return yield* new ValidationError({ message: result.message });
		return toLoggedDto(result.session);
	});

/** Whose logs a request is about: a player's own; a coach names an assigned player with `?playerId=`. */
const subject = (user: CurrentUserData) =>
	Effect.gen(function* () {
		if (user.role === 'player') return user.id;
		const { event } = yield* RequestContext;
		const playerId = event.url.searchParams.get('playerId') ?? '';
		if (!UUID.test(playerId)) return yield* new ValidationError({ message: 'Invalid request: check playerId' });
		yield* assignedPlayer(user.id, playerId);
		return playerId;
	});

/** `GET /api/logged-sessions`: newest first. A coach adds `?playerId=` for an assigned player. */
export const listLoggedSessions = Effect.gen(function* () {
	const user = yield* currentUser;
	const playerId = yield* subject(user);
	return { sessions: (yield* (yield* LoggedSessions).listForPlayer(playerId)).map(toLoggedDto) };
});

/** `POST /api/logged-sessions`: the player logs a session. */
export const createLoggedSession = Effect.gen(function* () {
	const player = yield* requireRole('player');
	const body = yield* decodeBody(CreateLoggedSessionRequest);
	yield* checkDate(body.date);
	yield* checkVideo(player.id, body.videoId);
	const fields: LoggedFields = {
		loggedOn: body.date,
		tags: body.tags ?? [],
		minutes: body.minutes ?? null,
		workedOn: blankToNull(body.workedOn) ?? null,
		drillIds: body.drillIds ?? [],
		notes: blankToNull(body.notes) ?? null,
		videoId: body.videoId ?? null
	};
	return yield* saved(yield* (yield* LoggedSessions).create({ playerId: player.id, ...fields }));
});

/** `PATCH /api/logged-sessions/:id`: the player edits their own log (another player's is a 404). */
export const updateLoggedSession = Effect.gen(function* () {
	const player = yield* requireRole('player');
	const body = yield* decodeBody(UpdateLoggedSessionRequest);
	const id = yield* idParam;
	if (body.date !== undefined) yield* checkDate(body.date);
	yield* checkVideo(player.id, body.videoId);
	const patch: Partial<{ -readonly [K in keyof LoggedFields]: LoggedFields[K] }> = {};
	if (body.date !== undefined) patch.loggedOn = body.date;
	if (body.tags !== undefined) patch.tags = body.tags;
	if (body.minutes !== undefined) patch.minutes = body.minutes;
	if (body.workedOn !== undefined) patch.workedOn = blankToNull(body.workedOn)!;
	if (body.drillIds !== undefined) patch.drillIds = body.drillIds;
	if (body.notes !== undefined) patch.notes = blankToNull(body.notes)!;
	if (body.videoId !== undefined) patch.videoId = body.videoId;
	return yield* saved(yield* (yield* LoggedSessions).update({ id, playerId: player.id, patch }));
});

/** `DELETE /api/logged-sessions/:id`: the player removes their own log; the video stays in their library. */
export const deleteLoggedSession = Effect.gen(function* () {
	const player = yield* requireRole('player');
	const id = yield* idParam;
	if (!(yield* (yield* LoggedSessions).remove({ id, playerId: player.id }))) return yield* new NotFound({ message: 'Session not found' });
	return { ok: true as const };
});

/** The drill library as the log form's picker shows it: names and categories only. */
const pickerDrills = Effect.gen(function* () {
	return (yield* (yield* Drills).list()).map((d) => ({ id: d.id, name: d.name, category: d.category }));
});

/** Data for `/sessions/new`: the drills a player can pick from. */
export const logPageData = Effect.gen(function* () {
	yield* requireRole('player');
	return { drills: yield* pickerDrills };
});

/** Data for `/sessions/:id/edit`: the player's own log, and the drill picker. */
export const editPageData = Effect.gen(function* () {
	const player = yield* requireRole('player');
	const log = yield* (yield* LoggedSessions).get(yield* idParam);
	if (!log || log.playerId !== player.id) return yield* new NotFound({ message: 'Session not found' });
	return { session: toLoggedDto(log), drills: yield* pickerDrills };
});
