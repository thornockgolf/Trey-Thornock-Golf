import { Schema } from 'effect';
import { Uuid } from './analyses';

/** Coach-player chat (spec 3.E.1). One conversation per coach-player pair. */

export const MAX_MESSAGE_LENGTH = 4000;
/** Per sender, over any 60 s window. */
export const MESSAGES_PER_MINUTE = 30;
export const MESSAGE_PAGE_SIZE = 50;

/** `POST /api/conversations/:id/messages`. A video reference needs the video; `videoMs` needs `videoId`. */
export const SendMessageRequest = Schema.Struct({
	body: Schema.String.pipe(Schema.check(Schema.isMinLength(1), Schema.isMaxLength(MAX_MESSAGE_LENGTH))),
	videoId: Schema.optional(Uuid),
	videoMs: Schema.optional(Schema.Number.pipe(Schema.check(Schema.isInt(), Schema.isBetween({ minimum: 0, maximum: 24 * 3_600_000 })))),
	/**
	 * The highest `seq` of the other side's messages the sender had on screen. Sending counts as having read the thread
	 * from `seenFromSeq` up to there, and no further (a message that arrived while they typed is still unread).
	 */
	seenSeq: Schema.optional(Schema.Number.pipe(Schema.check(Schema.isInt(), Schema.isBetween({ minimum: 0, maximum: Number.MAX_SAFE_INTEGER })))),
	/** The lowest `seq` they had loaded: older unread messages (not paged in yet) stay unread. */
	seenFromSeq: Schema.optional(Schema.Number.pipe(Schema.check(Schema.isInt(), Schema.isBetween({ minimum: 0, maximum: Number.MAX_SAFE_INTEGER }))))
});
export type SendMessageRequest = typeof SendMessageRequest.Type;

export interface MessageDto {
	readonly id: string;
	/** Monotonic per database: the cursor for catching up after a reconnect (`?after=`). */
	readonly seq: number;
	readonly conversationId: string;
	readonly senderId: string;
	readonly body: string;
	readonly videoId: string | null;
	/** Integer ms on the processed timeline; the recipient's tap opens the video at this time. */
	readonly videoMs: number | null;
	readonly createdAt: string;
	/** When the other person read it (they had it on screen); null while unread. Meaningful for the sender's own messages. */
	readonly readAt: string | null;
}

/** `GET /api/conversations/:id/receipts`: which of the caller's own messages have been read, for the "Seen" markers. */
export interface ReceiptsDto {
	readonly receipts: readonly { readonly id: string; readonly seq: number; readonly readAt: string }[];
}

/** Payload of `message.read` on the conversation channel: only a nudge, the truth is `GET .../receipts`. */
export interface MessageReadEvent {
	readonly conversationId: string;
	readonly readerId: string;
}

export interface ConversationDto {
	readonly id: string;
	readonly other: { readonly id: string; readonly displayName: string | null; readonly email: string | null; readonly role: 'coach' | 'player' };
	/** The newest message of the general thread (the Messages tab); messages about a video live on its page. */
	readonly lastMessage: MessageDto | null;
	/** Unread messages from the other side in the general thread. */
	readonly unread: number;
	/** Unread messages from the other side that are tied to videos, and the video of the newest one. */
	readonly videoUnread: number;
	readonly videoUnreadVideoId: string | null;
	readonly updatedAt: string;
}

export interface MessagePageDto {
	readonly conversation: ConversationDto;
	readonly messages: readonly MessageDto[];
	/** True when there are older messages than the first one returned (`?before=`). */
	readonly hasMore: boolean;
}

/** `{ unread }` for the nav badge. */
export interface UnreadDto {
	readonly messages: number;
	readonly notifications: number;
}

export const conversationTopic = (conversationId: string) => `conversation:${conversationId}`;
export const userTopic = (userId: string) => `user:${userId}`;

/** Events published on those channels. */
export const REALTIME_EVENTS = ['message.created', 'message.read', 'notification.created', 'video.ready', 'video.failed'] as const;
export type RealtimeEvent = (typeof REALTIME_EVENTS)[number];
