import { Schema } from 'effect';

/** The coach's view of players and the notes they keep on them (spec 3.F, 3.E.3). */

export const MAX_NOTE_LENGTH = 4000;

/** What to call a player when they have not given a name: their email, else a short id. */
export const playerLabel = (p: { id: string; displayName: string | null; email: string | null }) =>
	p.displayName?.trim() || p.email?.trim() || `Player ${p.id.slice(0, 4)}`;

export interface PlayerSummaryDto {
	readonly id: string;
	readonly displayName: string | null;
	readonly email: string | null;
	/** An active coaching relationship with the signed-in coach. Only assigned players' videos, notes and plans are open to the coach. */
	readonly assigned: boolean;
	readonly joinedAt: string;
	/** Ready swing videos added in the last 7 days. */
	readonly newVideos: number;
	readonly lastVideoAt: string | null;
	/** Sessions on active plans still ahead (today or later) and not done. */
	readonly upcomingSessions: number;
	readonly completedSessions: number;
	readonly hasQuestionnaire: boolean;
	/** Messages from the player the coach has not read. */
	readonly unreadMessages: number;
}

/** A ready swing video the coach has not recorded an analysis for yet (dashboard "Videos to record"). */
export interface VideoToRecordDto {
	readonly videoId: string;
	readonly title: string | null;
	readonly createdAt: string;
	readonly durationMs: number | null;
	readonly posterUrl: string | null;
	readonly playerId: string;
	readonly playerName: string | null;
	readonly playerEmail: string | null;
}

/** A chat thread with unread messages from a player (dashboard "Messages from players"). */
export interface UnreadThreadDto {
	readonly conversationId: string;
	readonly playerId: string;
	readonly playerName: string | null;
	readonly playerEmail: string | null;
	/** null for the general thread. */
	readonly videoId: string | null;
	readonly videoTitle: string | null;
	readonly unread: number;
	readonly latestAt: string;
	readonly preview: string;
}

/** Where an unread thread opens: the video page for a video thread, else the general conversation. */
export const unreadThreadHref = (t: Pick<UnreadThreadDto, 'videoId' | 'conversationId'>) =>
	t.videoId ? `/videos/${t.videoId}` : `/messages/${t.conversationId}`;

/** `POST /api/players/:id/notes`. */
export const AddNoteRequest = Schema.Struct({
	body: Schema.String.pipe(Schema.check(Schema.isMinLength(1), Schema.isMaxLength(MAX_NOTE_LENGTH)))
});
export type AddNoteRequest = typeof AddNoteRequest.Type;

/** `POST /api/players/:id/delete`. Permanent, so the body has to say so. */
export const DeletePlayerRequest = Schema.Struct({ confirm: Schema.Literal(true) });
export type DeletePlayerRequest = typeof DeletePlayerRequest.Type;

export interface CoachNoteDto {
	readonly id: string;
	readonly body: string;
	readonly createdAt: string;
}
