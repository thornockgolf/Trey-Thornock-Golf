import { Billing, Chat, Coaching, Notifications, Realtime, Users, Videos, type Conversation, type ConversationSummary, type Message } from '@ttg/db';
import {
	MESSAGE_PAGE_SIZE,
	SendMessageRequest,
	conversationTopic,
	type ConversationDto,
	type MessageDto,
	type MessagePageDto,
	type UnreadDto
} from '@ttg/shared';
import { Effect } from 'effect';
import { currentUser } from './auth';
import { decodeBody } from './decode';
import { requireMembership } from './entitlements';
import { Forbidden, NotFound, RateLimited, ValidationError } from './errors';
import { publishNotifications } from './notify';
import { RequestContext } from './request-context';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export const toMessageDto = (m: Message): MessageDto => ({
	id: m.id,
	seq: m.seq,
	conversationId: m.conversationId,
	senderId: m.senderId,
	body: m.body,
	videoId: m.videoId,
	videoMs: m.videoMs,
	createdAt: m.createdAt.toISOString()
});

export const toConversationDto = (c: ConversationSummary): ConversationDto => ({
	id: c.id,
	other: c.other,
	lastMessage: c.lastMessage ? toMessageDto(c.lastMessage) : null,
	unread: c.unread,
	updatedAt: c.updatedAt.toISOString()
});

/** The conversation in `:id`, if the signed-in user is one of its two people. 404 for an unknown id, 403 for anyone else. */
export const participantConversation = (userId: string, id: string) =>
	Effect.gen(function* () {
		if (!UUID.test(id)) return yield* new NotFound({ message: 'Conversation not found' });
		const conversation = yield* (yield* Chat).find(id);
		if (!conversation) return yield* new NotFound({ message: 'Conversation not found' });
		if (conversation.coachId !== userId && conversation.playerId !== userId) return yield* new Forbidden({ message: 'Not allowed' });
		return conversation;
	});

const conversationParam = Effect.gen(function* () {
	const user = yield* currentUser;
	const { event } = yield* RequestContext;
	return { user, conversation: yield* participantConversation(user.id, event.params.id ?? '') };
});

const intParam = (value: string | null, max: number) => {
	if (value === null || value === '') return undefined;
	const n = Number(value);
	return Number.isInteger(n) && n >= 0 && n <= max ? n : null;
};

/** `GET /api/conversations`: the signed-in user's conversations, most recent first. */
export const listConversations = Effect.gen(function* () {
	const user = yield* currentUser;
	return { conversations: (yield* (yield* Chat).listFor(user.id)).map(toConversationDto) };
});

/** `GET /api/conversations/:id/messages[?after=seq|before=seq&limit=n]`: participants only. */
export const listMessages = Effect.gen(function* () {
	const { user, conversation } = yield* conversationParam;
	const { event } = yield* RequestContext;
	const after = intParam(event.url.searchParams.get('after'), Number.MAX_SAFE_INTEGER);
	const before = intParam(event.url.searchParams.get('before'), Number.MAX_SAFE_INTEGER);
	const limit = intParam(event.url.searchParams.get('limit'), 100) ?? MESSAGE_PAGE_SIZE;
	if (after === null || before === null || limit === null || limit < 1) return yield* new ValidationError({ message: 'Invalid cursor or limit' });
	const chat = yield* Chat;
	const page = yield* chat.messages(conversation.id, { ...(after !== undefined ? { after } : {}), ...(before !== undefined ? { before } : {}), limit });
	const summary = yield* chat.summary(conversation.id, user.id);
	return { conversation: toConversationDto(summary!), messages: page.messages.map(toMessageDto), hasMore: page.hasMore } satisfies MessagePageDto;
});

/** Whether the signed-in user may write in the conversation now, and if not why (the thread shows it instead of a composer). */
export const composeState = (user: { id: string; role: 'player' | 'coach' }, conversation: Conversation) =>
	Effect.gen(function* () {
		if (!(yield* (yield* Videos).isAssignedCoach(conversation.coachId, conversation.playerId))) return { allowed: false as const, reason: 'ended' as const };
		if (user.role === 'coach') return { allowed: true as const, reason: null };
		const e = yield* (yield* Billing).entitlements(user.id);
		if (!e.membership) return { allowed: false as const, reason: e.pastDue ? ('past_due' as const) : ('payment' as const) };
		return { allowed: true as const, reason: null };
	});

/** `/messages/:id` page data: the newest messages and whether the user can write. 403 for anyone who is not in it. */
export const threadPageData = Effect.gen(function* () {
	const { user, conversation } = yield* conversationParam;
	const chat = yield* Chat;
	const page = yield* chat.messages(conversation.id, { limit: MESSAGE_PAGE_SIZE });
	const summary = yield* chat.summary(conversation.id, user.id);
	return {
		me: user.id,
		conversation: toConversationDto(summary!),
		messages: page.messages.map(toMessageDto),
		hasMore: page.hasMore,
		compose: yield* composeState(user, conversation)
	};
});

/**
 * `/messages/new?video=&player=`: find or create the conversation to continue in. A player's is with their coach;
 * a coach names a player (or a video of theirs). `null` when the player has no coach yet.
 */
export const conversationToOpen = Effect.gen(function* () {
	const user = yield* currentUser;
	const { event } = yield* RequestContext;
	const videoId = event.url.searchParams.get('video');
	let playerId = event.url.searchParams.get('player');
	if (videoId !== null) {
		if (!UUID.test(videoId)) return yield* new NotFound({ message: 'Video not found' });
		const video = yield* (yield* Videos).find(videoId);
		if (!video) return yield* new NotFound({ message: 'Video not found' });
		// only about the player's own videos, or a reference clip
		if (user.role === 'player' && video.ownerId !== user.id && video.kind !== 'reference') return yield* new Forbidden({ message: 'Not allowed' });
		if (user.role === 'coach' && !playerId && video.kind !== 'reference') playerId = video.ownerId;
	}
	const coaching = yield* Coaching;
	let coachId: string | undefined;
	if (user.role === 'player') {
		coachId = yield* coaching.coachFor(user.id);
		playerId = user.id;
	} else {
		coachId = user.id;
		if (!playerId || !UUID.test(playerId)) return yield* new NotFound({ message: 'Player not found' });
		if (!(yield* (yield* Videos).isAssignedCoach(user.id, playerId))) return yield* new Forbidden({ message: 'Not allowed' });
	}
	if (!coachId || !playerId) return null;
	const conversation = yield* (yield* Chat).ensure(coachId, playerId);
	return { id: conversation.id };
});

/** `POST /api/conversations/:id/messages`. */
export const sendMessage = Effect.gen(function* () {
	const user = yield* currentUser;
	const { event } = yield* RequestContext;
	const input = yield* decodeBody(SendMessageRequest);
	const conversation = yield* participantConversation(user.id, event.params.id ?? '');
	const body = input.body.trim();
	if (body.length === 0) return yield* new ValidationError({ message: 'Invalid request: check body' });
	if (input.videoMs !== undefined && input.videoId === undefined) return yield* new ValidationError({ message: 'Invalid request: check videoId' });
	// Who may talk: an active coaching relationship, and (for the player) a paid membership.
	if (!(yield* (yield* Videos).isAssignedCoach(conversation.coachId, conversation.playerId)))
		return yield* new Forbidden({ message: 'This coaching relationship has ended' });
	yield* requireMembership(user);

	const sender = yield* (yield* Users).findById(user.id);
	const result = yield* (yield* Chat).send({
		conversation,
		senderId: user.id,
		senderName: sender?.displayName?.trim() || sender?.email || null,
		body,
		videoId: input.videoId,
		videoMs: input.videoMs
	});
	if (result._tag === 'RateLimited') return yield* new RateLimited({ message: 'You are sending messages too fast. Wait a moment' });
	if (result._tag === 'BadVideo') return yield* new ValidationError({ message: 'Invalid request: check videoId' });
	const dto = toMessageDto(result.message);
	yield* (yield* Realtime).publish(conversationTopic(conversation.id), 'message.created', dto);
	yield* publishNotifications([result.notification]);
	return dto;
});

/** `POST /api/conversations/:id/read`: the user opened the conversation. Clears its unread count and notification. */
export const markConversationRead = Effect.gen(function* () {
	const { user, conversation } = yield* conversationParam;
	yield* (yield* Chat).markRead(conversation, user.id);
	return { unread: yield* unreadFor(user.id) };
});

const unreadFor = (userId: string) =>
	Effect.gen(function* () {
		const [messages, notifications] = yield* Effect.all([(yield* Chat).unreadFor(userId), (yield* Notifications).unreadCount(userId)]);
		return { messages, notifications } satisfies UnreadDto;
	});

/** `GET /api/unread`: counts for the nav badges, straight from Postgres (right after being offline, too). */
export const getUnread = Effect.gen(function* () {
	const user = yield* currentUser;
	return yield* unreadFor(user.id);
});

export type { Conversation };
