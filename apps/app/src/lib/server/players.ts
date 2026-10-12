import { Coaching, Plans, Questionnaires, Users, Videos, type PlayerSummary } from '@ttg/db';
import { AddNoteRequest, type CoachNoteDto, type PlayerSummaryDto } from '@ttg/shared';
import { Effect } from 'effect';
import { requireRole } from './auth';
import { decodeBody } from './decode';
import { Forbidden, NotFound } from './errors';
import { toQuestionnaireDto } from './questionnaire';
import { RequestContext } from './request-context';
import { toSessionDto } from './plans';
import { posterUrl, toDto } from './videos';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export const toPlayerSummaryDto = (p: PlayerSummary): PlayerSummaryDto => ({
	id: p.id,
	displayName: p.displayName,
	email: p.email,
	assigned: p.assigned,
	joinedAt: p.joinedAt.toISOString(),
	newVideos: p.newVideos,
	lastVideoAt: p.lastVideoAt?.toISOString() ?? null,
	upcomingSessions: p.upcomingSessions,
	completedSessions: p.completedSessions,
	hasQuestionnaire: p.hasQuestionnaire
});

/** The `:id` of a player route. Anything that is not a UUID is a 404. */
export const playerIdParam = Effect.gen(function* () {
	const { event } = yield* RequestContext;
	const id = event.params.id ?? '';
	if (!UUID.test(id)) return yield* new NotFound({ message: 'Player not found' });
	return id;
});

/** A coach and a player they have an active relationship with: the check every per-player coach endpoint makes. */
export const assignedPlayer = (coachId: string, playerId: string) =>
	Effect.gen(function* () {
		const player = yield* (yield* Users).findById(playerId);
		if (!player || player.role !== 'player') return yield* new NotFound({ message: 'Player not found' });
		if (!(yield* (yield* Videos).isAssignedCoach(coachId, playerId))) return yield* new Forbidden({ message: 'Not allowed' });
		return player;
	});

/** `GET /api/players`: every player, with whether the coach is working with them. Coach only. */
export const listPlayers = Effect.gen(function* () {
	const coach = yield* requireRole('coach');
	return { players: (yield* (yield* Coaching).listPlayers(coach.id)).map(toPlayerSummaryDto) };
});

/** `POST /api/players/:id/assign`: start (or resume) coaching a player. Coach only. */
export const assignPlayer = Effect.gen(function* () {
	const coach = yield* requireRole('coach');
	const playerId = yield* playerIdParam;
	if ((yield* (yield* Coaching).assign(coach.id, playerId)) === 'NotAPlayer') return yield* new NotFound({ message: 'Player not found' });
	return { ok: true };
});

/** `POST /api/players/:id/unassign`: end the relationship. Their videos and history stay. Coach only. */
export const unassignPlayer = Effect.gen(function* () {
	const coach = yield* requireRole('coach');
	const playerId = yield* playerIdParam;
	if (!(yield* (yield* Coaching).end(coach.id, playerId))) return yield* new NotFound({ message: 'Player not found' });
	return { ok: true };
});

const toNoteDto = (n: { id: string; body: string; createdAt: Date }): CoachNoteDto => ({ id: n.id, body: n.body, createdAt: n.createdAt.toISOString() });

/** `GET /api/players/:id/notes`: the coach's private notes on an assigned player. Never reachable by players. */
export const listNotes = Effect.gen(function* () {
	const coach = yield* requireRole('coach');
	const playerId = yield* playerIdParam;
	yield* assignedPlayer(coach.id, playerId);
	return { notes: (yield* (yield* Coaching).listNotes(coach.id, playerId)).map(toNoteDto) };
});

/** `POST /api/players/:id/notes`: add a private note. Coach only, assigned players only. */
export const addNote = Effect.gen(function* () {
	const coach = yield* requireRole('coach');
	const body = yield* decodeBody(AddNoteRequest);
	const playerId = yield* playerIdParam;
	yield* assignedPlayer(coach.id, playerId);
	const result = yield* (yield* Coaching).addNote(coach.id, playerId, body.body.trim());
	if (result._tag === 'NotPaired') return yield* new Forbidden({ message: 'Not allowed' });
	return toNoteDto(result.note);
});

/** `/coach` dashboard: every player (the page splits the coach's own from the rest). */
export const dashboardData = Effect.gen(function* () {
	const coach = yield* requireRole('coach');
	return { players: (yield* (yield* Coaching).listPlayers(coach.id)).map(toPlayerSummaryDto) };
});

/**
 * `/coach/players/:id`: an assigned player's questionnaire, videos, plan progress and the coach's private notes.
 * 403 for a player the coach is not working with, 404 for an unknown id. Players have no route to this data.
 */
export const playerDetailData = Effect.gen(function* () {
	const coach = yield* requireRole('coach');
	const playerId = yield* playerIdParam;
	const player = yield* assignedPlayer(coach.id, playerId);
	const summary = (yield* (yield* Coaching).listPlayers(coach.id)).find((p) => p.id === playerId);
	const [questionnaire, videos, sessions, notes] = yield* Effect.all([
		(yield* Questionnaires).getLatestCompleted(playerId),
		(yield* Videos).listByOwner(playerId),
		(yield* Plans).listSessionsForPlayer(playerId),
		(yield* Coaching).listNotes(coach.id, playerId)
	]);
	const videoDtos = yield* Effect.forEach(
		videos.filter((v) => v.status !== 'pending'),
		(v) => posterUrl(v).pipe(Effect.map((p) => toDto(v, p))),
		{ concurrency: 8 }
	);
	return {
		player: { ...toPlayerSummaryDto(summary!), displayName: player.displayName, email: player.email },
		questionnaire: questionnaire ? toQuestionnaireDto(questionnaire) : null,
		videos: videoDtos,
		sessions: sessions.map(toSessionDto),
		notes: notes.map(toNoteDto)
	};
});
