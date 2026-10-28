import { Context, Effect, Layer } from 'effect';
import { MESSAGES_PER_MINUTE } from '@ttg/shared';
import { Db } from './db';
import type { DatabaseError } from './errors';
import { insertNotification, type Notification } from './notifications';

export interface Message {
	readonly id: string;
	readonly seq: number;
	readonly conversationId: string;
	readonly senderId: string;
	readonly body: string;
	readonly videoId: string | null;
	readonly videoMs: number | null;
	readonly createdAt: Date;
}

/**
 * Which messages of a conversation: all of them, the general thread (tied to no video; the Messages tab), or the thread
 * of one video. A message belongs to the video it points at, whatever the moment.
 */
export type MessageScope = 'general' | { readonly videoId: string };

export interface Conversation {
	readonly id: string;
	readonly coachId: string;
	readonly playerId: string;
}

export interface ConversationSummary {
	readonly id: string;
	readonly other: { readonly id: string; readonly displayName: string | null; readonly email: string | null; readonly role: 'coach' | 'player' };
	/** The newest message of the general thread (video threads show on their videos). */
	readonly lastMessage: Message | null;
	/** Unread messages in the general thread. */
	readonly unread: number;
	/** Unread messages tied to videos, and the video of the newest of them. */
	readonly videoUnread: number;
	readonly videoUnreadVideoId: string | null;
	readonly updatedAt: Date;
}

export type SendOutcome =
	| { readonly _tag: 'Sent'; readonly message: Message; readonly recipientId: string; readonly notification: Notification }
	| { readonly _tag: 'RateLimited' }
	| { readonly _tag: 'BadVideo' };

interface MessageRow {
	id: string;
	seq: string;
	conversation_id: string;
	sender_id: string;
	body: string;
	video_id: string | null;
	video_ms: number | null;
	created_at: Date;
}

const MESSAGE_COLUMNS = 'm.id, m.seq, m.conversation_id, m.sender_id, m.body, m.video_id, m.video_ms, m.created_at';
const toMessage = (r: MessageRow): Message => ({
	id: r.id,
	seq: Number(r.seq),
	conversationId: r.conversation_id,
	senderId: r.sender_id,
	body: r.body,
	videoId: r.video_id,
	videoMs: r.video_ms,
	createdAt: r.created_at
});

interface SummaryRow {
	id: string;
	updated_at: Date;
	other_id: string;
	other_name: string | null;
	other_email: string | null;
	other_role: 'coach' | 'player';
	unread: string;
	video_unread: string;
	video_unread_video_id: string | null;
	m_id: string | null;
	m_seq: string | null;
	m_sender_id: string | null;
	m_body: string | null;
	m_video_id: string | null;
	m_video_ms: number | null;
	m_created_at: Date | null;
}

/** The SQL for a scope on alias `m`, with its parameter (if any) appended to `params`. */
const scopeSql = (scope: MessageScope | undefined, params: unknown[]) => {
	if (scope === undefined) return '';
	if (scope === 'general') return ' and m.video_id is null';
	params.push(scope.videoId);
	return ` and m.video_id = $${params.length}`;
};

const preview = (body: string) => (body.length > 120 ? `${body.slice(0, 117)}...` : body);

export class Chat extends Context.Service<
	Chat,
	{
		/** The conversation for a pair, created on first use. The caller has already checked the pair may talk. */
		readonly ensure: (coachId: string, playerId: string) => Effect.Effect<Conversation, DatabaseError>;
		readonly find: (id: string) => Effect.Effect<Conversation | undefined, DatabaseError>;
		/** The user's conversations, most recent activity first. Only the user's own. */
		readonly listFor: (userId: string) => Effect.Effect<readonly ConversationSummary[], DatabaseError>;
		readonly summary: (conversationId: string, userId: string) => Effect.Effect<ConversationSummary | undefined, DatabaseError>;
		/**
		 * Oldest first. `after` is a `seq` cursor (catch-up); `before` pages back; with neither, the newest `limit`.
		 * `hasMore` says older messages exist before the first one returned.
		 */
		readonly messages: (
			conversationId: string,
			opts: { after?: number; before?: number; limit: number; scope?: MessageScope }
		) => Effect.Effect<{ messages: readonly Message[]; hasMore: boolean }, DatabaseError>;
		/** Store a message, mark the other side's messages in the same thread read (the sender has seen them), and fold it into the recipient's one unread "message" notification for that thread. */
		readonly send: (input: {
			conversation: Conversation;
			senderId: string;
			senderName: string | null;
			body: string;
			videoId?: string | undefined;
			videoMs?: number | undefined;
		}) => Effect.Effect<SendOutcome, DatabaseError>;
		/** Mark the other side's messages in the scope read (all of them without one), and that thread's notifications. */
		readonly markRead: (conversation: Conversation, userId: string, scope?: MessageScope) => Effect.Effect<void, DatabaseError>;
		/** Unread messages across all of the user's conversations, video threads included. */
		readonly unreadFor: (userId: string) => Effect.Effect<number, DatabaseError>;
	}
>()('ttg/db/Chat') {
	static readonly layer = Layer.effect(
		Chat,
		Effect.gen(function* () {
			const db = yield* Db;

			const unreadSql = `(select count(*) from messages x where x.conversation_id = c.id and x.sender_id <> $1 and x.read_at is null)`;
			const summarySql = `select c.id, c.updated_at, o.id as other_id, o.display_name as other_name, o.email as other_email, o.role as other_role,
			    (select count(*) from messages x where x.conversation_id = c.id and x.sender_id <> $1 and x.read_at is null and x.video_id is null) as unread,
			    (select count(*) from messages x where x.conversation_id = c.id and x.sender_id <> $1 and x.read_at is null and x.video_id is not null) as video_unread,
			    (select x.video_id from messages x where x.conversation_id = c.id and x.sender_id <> $1 and x.read_at is null and x.video_id is not null order by x.seq desc limit 1) as video_unread_video_id,
			    lm.id as m_id, lm.seq as m_seq, lm.sender_id as m_sender_id, lm.body as m_body, lm.video_id as m_video_id, lm.video_ms as m_video_ms, lm.created_at as m_created_at
			  from conversations c
			  join users o on o.id = case when c.coach_id = $1 then c.player_id else c.coach_id end
			  left join lateral (select * from messages where conversation_id = c.id and video_id is null order by seq desc limit 1) lm on true
			  where (c.coach_id = $1 or c.player_id = $1)`;
			const toSummary = (r: SummaryRow): ConversationSummary => ({
				id: r.id,
				other: { id: r.other_id, displayName: r.other_name, email: r.other_email, role: r.other_role },
				lastMessage: r.m_id
					? toMessage({ id: r.m_id, seq: r.m_seq!, conversation_id: r.id, sender_id: r.m_sender_id!, body: r.m_body!, video_id: r.m_video_id, video_ms: r.m_video_ms, created_at: r.m_created_at! })
					: null,
				unread: Number(r.unread),
				videoUnread: Number(r.video_unread),
				videoUnreadVideoId: r.video_unread_video_id,
				updatedAt: r.updated_at
			});
			const find = (id: string) =>
				db.maybeOne<{ id: string; coach_id: string; player_id: string }>(`select id, coach_id, player_id from conversations where id = $1`, [id]).pipe(
					Effect.map((r) => (r ? { id: r.id, coachId: r.coach_id, playerId: r.player_id } : undefined))
				);

			return Chat.of({
				ensure: (coachId, playerId) =>
					db
						.maybeOne<{ id: string }>(
							`insert into conversations (coach_id, player_id) values ($1, $2)
							 on conflict (coach_id, player_id) do update set coach_id = excluded.coach_id returning id`,
							[coachId, playerId]
						)
						.pipe(Effect.map((r) => ({ id: r!.id, coachId, playerId }))),
				find,
				listFor: (userId) =>
					db.query<SummaryRow>(`${summarySql} order by coalesce(lm.created_at, c.updated_at) desc`, [userId]).pipe(Effect.map((rows) => rows.map(toSummary))),
				summary: (conversationId, userId) =>
					db.maybeOne<SummaryRow>(`${summarySql} and c.id = $2`, [userId, conversationId]).pipe(Effect.map((r) => (r ? toSummary(r) : undefined))),
				messages: (conversationId, { after, before, limit, scope }) =>
					Effect.gen(function* () {
						const params: unknown[] = [conversationId];
						const scoped = scopeSql(scope, params);
						if (after !== undefined) {
							params.push(after, limit + 1);
							const rows = yield* db.query<MessageRow>(
								`select ${MESSAGE_COLUMNS} from messages m where m.conversation_id = $1${scoped} and m.seq > $${params.length - 1} order by m.seq limit $${params.length}`,
								params
							);
							// A catch-up longer than a page returns the oldest page; the client asks again from its last seq.
							return { messages: rows.slice(0, limit).map(toMessage), hasMore: false };
						}
						params.push(before ?? null, limit + 1);
						const rows = yield* db.query<MessageRow>(
							`select ${MESSAGE_COLUMNS} from messages m where m.conversation_id = $1${scoped} and ($${params.length - 1}::bigint is null or m.seq < $${params.length - 1}) order by m.seq desc limit $${params.length}`,
							params
						);
						return { messages: rows.slice(0, limit).reverse().map(toMessage), hasMore: rows.length > limit };
					}),
				send: (i) =>
					db.transaction((tx) =>
						Effect.gen(function* () {
							// Serialize one sender's sends so the rate check cannot be raced past.
							yield* tx.query(`select pg_advisory_xact_lock(hashtextextended($1::text, 0))`, [i.senderId]);
							const recent = yield* tx.maybeOne<{ n: string }>(
								`select count(*) as n from messages where sender_id = $1 and created_at > now() - interval '1 minute'`,
								[i.senderId]
							);
							if (Number(recent?.n ?? 0) >= MESSAGES_PER_MINUTE) return { _tag: 'RateLimited' } as const;
							if (i.videoId !== undefined) {
								// The video must be the player's own, or a reference clip.
								const ok = yield* tx.maybeOne(`select 1 as ok from videos where id = $1 and (owner_id = $2 or kind = 'reference')`, [i.videoId, i.conversation.playerId]);
								if (!ok) return { _tag: 'BadVideo' } as const;
							}
							const row = yield* tx.maybeOne<MessageRow>(
								`insert into messages as m (conversation_id, sender_id, body, video_id, video_ms) values ($1, $2, $3, $4, $5) returning ${MESSAGE_COLUMNS}`,
								[i.conversation.id, i.senderId, i.body, i.videoId ?? null, i.videoMs ?? null]
							);
							const message = toMessage(row!);
							const senderIsCoach = i.senderId === i.conversation.coachId;
							const recipientId = senderIsCoach ? i.conversation.playerId : i.conversation.coachId;
							yield* tx.query(`update conversations set updated_at = now() where id = $1`, [i.conversation.id]);
							// Sending in a thread means the sender has seen what the other side said there.
							yield* tx.query(
								`update messages set read_at = now() where conversation_id = $1 and sender_id <> $2 and read_at is null and video_id is not distinct from $3::uuid`,
								[i.conversation.id, i.senderId, message.videoId]
							);
							// One unread "message" notification per conversation thread (general, or one per video), counting up.
							const payload = {
								conversationId: i.conversation.id,
								senderId: i.senderId,
								senderName: i.senderName ?? (senderIsCoach ? 'Your coach' : 'Your player'),
								lastMessageId: message.id,
								preview: preview(i.body),
								...(message.videoId ? { videoId: message.videoId } : {})
							};
							const existing = yield* tx.maybeOne<{ id: string; payload: { count?: number } }>(
								`select id, payload from notifications where user_id = $1 and type = 'message' and read_at is null and payload->>'conversationId' = $2
								   and payload->>'videoId' is not distinct from $3::text order by created_at desc limit 1 for update`,
								[recipientId, i.conversation.id, message.videoId]
							);
							const notification = existing
								? toNotificationRow(
										yield* tx.maybeOne<NotificationRow>(
											`update notifications set payload = $2::jsonb, created_at = now() where id = $1 returning id, user_id, type, payload, read_at, created_at`,
											[existing.id, JSON.stringify({ ...payload, count: (existing.payload.count ?? 1) + 1 })]
										)
									)
								: yield* insertNotification(tx, recipientId, 'message', { ...payload, count: 1 });
							return { _tag: 'Sent', message, recipientId, notification } as const;
						})
					),
				markRead: (conversation, userId, scope) =>
					db.transaction((tx) =>
						Effect.gen(function* () {
							const params: unknown[] = [conversation.id, userId];
							const scoped = scopeSql(scope, params);
							yield* tx.query(`update messages m set read_at = now() where m.conversation_id = $1 and m.sender_id <> $2 and m.read_at is null${scoped}`, params);
							const nParams: unknown[] = [userId, conversation.id];
							const nScope =
								scope === undefined ? '' : scope === 'general' ? ` and payload->>'videoId' is null` : (nParams.push(scope.videoId), ` and payload->>'videoId' = $3`);
							yield* tx.query(
								`update notifications set read_at = now() where user_id = $1 and type = 'message' and read_at is null and payload->>'conversationId' = $2${nScope}`,
								nParams
							);
						})
					),
				unreadFor: (userId) =>
					db
						.maybeOne<{ n: string }>(
							`select coalesce(sum(${unreadSql}), 0) as n from conversations c where c.coach_id = $1 or c.player_id = $1`,
							[userId]
						)
						.pipe(Effect.map((r) => Number(r?.n ?? 0)))
			});
		})
	);
}

interface NotificationRow {
	id: string;
	user_id: string;
	type: string;
	payload: Record<string, unknown>;
	read_at: Date | null;
	created_at: Date;
}

const toNotificationRow = (r: NotificationRow | undefined): Notification => ({
	id: r!.id,
	userId: r!.user_id,
	type: r!.type,
	payload: r!.payload,
	readAt: r!.read_at,
	createdAt: r!.created_at
});
