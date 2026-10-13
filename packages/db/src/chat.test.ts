import { assert, layer } from '@effect/vitest';
import { Effect, Layer } from 'effect';
import { Chat } from './chat';
import { Coaching } from './coaching';
import { Db } from './db';
import { Notifications } from './notifications';
import { TestDb } from './testing';
import { Users } from './users';

const Live = Layer.mergeAll(Users.layer, Coaching.layer, Chat.layer, Notifications.layer).pipe(Layer.provideMerge(TestDb));

layer(Live, { timeout: 60_000 })('Chat', (it) => {
	const setup = (tag: string) =>
		Effect.gen(function* () {
			const users = yield* Users;
			const coach = yield* users.ensure({ clerkUserId: `${tag}_c`, role: 'coach' });
			const player = yield* users.ensure({ clerkUserId: `${tag}_p`, role: 'player' });
			const chat = yield* Chat;
			const conversation = yield* chat.ensure(coach.id, player.id);
			return { coach, player, chat, conversation, db: yield* Db, notifications: yield* Notifications };
		});

	it.effect('ensure is idempotent per pair', () =>
		Effect.gen(function* () {
			const { coach, player, chat, conversation } = yield* setup('ch1');
			const again = yield* chat.ensure(coach.id, player.id);
			assert.strictEqual(again.id, conversation.id);
			assert.deepStrictEqual((yield* chat.find(conversation.id))?.playerId, player.id);
		})
	);

	it.effect('sends, orders by seq, pages, and catches up by cursor', () =>
		Effect.gen(function* () {
			const { player, chat, conversation } = yield* setup('ch2');
			for (let i = 1; i <= 5; i++) {
				const r = yield* chat.send({ conversation, senderId: player.id, senderName: 'P', body: `m${i}` });
				assert.strictEqual(r._tag, 'Sent');
			}
			const newest = yield* chat.messages(conversation.id, { limit: 3 });
			assert.deepStrictEqual(newest.messages.map((m) => m.body), ['m3', 'm4', 'm5']);
			assert.isTrue(newest.hasMore);
			const older = yield* chat.messages(conversation.id, { before: newest.messages[0]!.seq, limit: 3 });
			assert.deepStrictEqual(older.messages.map((m) => m.body), ['m1', 'm2']);
			assert.isFalse(older.hasMore);
			const caught = yield* chat.messages(conversation.id, { after: newest.messages[0]!.seq, limit: 50 });
			assert.deepStrictEqual(caught.messages.map((m) => m.body), ['m4', 'm5']);
		})
	);

	it.effect('folds unread messages into one notification and clears it when the conversation is read', () =>
		Effect.gen(function* () {
			const { coach, player, chat, conversation, notifications } = yield* setup('ch3');
			yield* chat.send({ conversation, senderId: player.id, senderName: 'Pat', body: 'one' });
			yield* chat.send({ conversation, senderId: player.id, senderName: 'Pat', body: 'two' });
			const list = yield* notifications.list(coach.id);
			assert.strictEqual(list.length, 1);
			assert.strictEqual(list[0]!.payload.count, 2);
			assert.strictEqual(list[0]!.payload.preview, 'two');
			assert.strictEqual(yield* chat.unreadFor(coach.id), 2);
			assert.strictEqual(yield* chat.unreadFor(player.id), 0);
			yield* chat.markRead(conversation, coach.id);
			assert.strictEqual(yield* chat.unreadFor(coach.id), 0);
			assert.strictEqual(yield* notifications.unreadCount(coach.id), 0);
			// the next message starts a fresh notification
			yield* chat.send({ conversation, senderId: player.id, senderName: 'Pat', body: 'three' });
			assert.strictEqual(yield* notifications.unreadCount(coach.id), 1);
		})
	);

	it.effect('lists conversations with the other side, last message and unread', () =>
		Effect.gen(function* () {
			const { coach, player, chat, conversation } = yield* setup('ch4');
			yield* chat.send({ conversation, senderId: coach.id, senderName: 'Trey', body: 'hello' });
			const mine = yield* chat.listFor(player.id);
			assert.strictEqual(mine.length, 1);
			assert.strictEqual(mine[0]!.other.id, coach.id);
			assert.strictEqual(mine[0]!.unread, 1);
			assert.strictEqual(mine[0]!.lastMessage?.body, 'hello');
			assert.strictEqual((yield* chat.listFor(coach.id))[0]!.unread, 0);
			assert.strictEqual(yield* chat.summary(conversation.id, player.id).pipe(Effect.map((s) => s?.other.role)), 'coach');
		})
	);

	it.effect('rate limits a sender at 30 per minute', () =>
		Effect.gen(function* () {
			const { player, chat, conversation } = yield* setup('ch5');
			for (let i = 0; i < 30; i++) assert.strictEqual((yield* chat.send({ conversation, senderId: player.id, senderName: null, body: 'x' }))._tag, 'Sent');
			assert.strictEqual((yield* chat.send({ conversation, senderId: player.id, senderName: null, body: 'x' }))._tag, 'RateLimited');
		})
	);

	it.effect('only lets a message point at the player\'s own video or a reference clip', () =>
		Effect.gen(function* () {
			const { coach, player, chat, conversation, db } = yield* setup('ch6');
			const users = yield* Users;
			const other = yield* users.ensure({ clerkUserId: 'ch6_o', role: 'player' });
			const vid = (owner: string, kind: string) =>
				db.maybeOne<{ id: string }>(`insert into videos (owner_id, kind, status) values ($1, $2, 'ready') returning id`, [owner, kind]).pipe(Effect.map((r) => r!.id));
			const mine = yield* vid(player.id, 'swing');
			const theirs = yield* vid(other.id, 'swing');
			const ref = yield* vid(coach.id, 'reference');
			const ok = yield* chat.send({ conversation, senderId: coach.id, senderName: null, body: 'look', videoId: mine, videoMs: 3200 });
			assert.strictEqual(ok._tag, 'Sent');
			if (ok._tag === 'Sent') assert.strictEqual(ok.message.videoMs, 3200);
			assert.strictEqual((yield* chat.send({ conversation, senderId: coach.id, senderName: null, body: 'x', videoId: theirs }))._tag, 'BadVideo');
			assert.strictEqual((yield* chat.send({ conversation, senderId: coach.id, senderName: null, body: 'x', videoId: ref }))._tag, 'Sent');
		})
	);

	it.effect('counts unread messages per player for the coach dashboard', () =>
		Effect.gen(function* () {
			const { coach, player, chat, conversation } = yield* setup('ch7');
			yield* (yield* Coaching).assign(coach.id, player.id);
			yield* chat.send({ conversation, senderId: player.id, senderName: null, body: 'hi' });
			const row = (yield* (yield* Coaching).listPlayers(coach.id)).find((p) => p.id === player.id);
			assert.strictEqual(row?.unreadMessages, 1);
			yield* chat.markRead(conversation, coach.id);
			assert.strictEqual((yield* (yield* Coaching).listPlayers(coach.id)).find((p) => p.id === player.id)?.unreadMessages, 0);
		})
	);
});

layer(Live, { timeout: 60_000 })('Notifications', (it) => {
	it.effect('lists newest first, counts unread and marks only the owner\'s rows read', () =>
		Effect.gen(function* () {
			const users = yield* Users;
			const n = yield* Notifications;
			const a = yield* users.ensure({ clerkUserId: 'nt_a', role: 'player' });
			const b = yield* users.ensure({ clerkUserId: 'nt_b', role: 'player' });
			const first = yield* n.create(a.id, 'plan_assigned', { planTitle: 'X' });
			yield* n.create(a.id, 'video_ready', {});
			const foreign = yield* n.create(b.id, 'video_ready', {});
			assert.deepStrictEqual((yield* n.list(a.id)).map((x) => x.type), ['video_ready', 'plan_assigned']);
			assert.strictEqual(yield* n.unreadCount(a.id), 2);
			assert.strictEqual(yield* n.markRead(a.id, [first.id, foreign.id]), 1);
			assert.strictEqual(yield* n.unreadCount(b.id), 1);
			assert.strictEqual(yield* n.markAllRead(a.id), 1);
			assert.strictEqual(yield* n.unreadCount(a.id), 0);
		})
	);
});
