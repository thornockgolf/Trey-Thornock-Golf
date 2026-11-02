import { assert, layer } from '@effect/vitest';
import { Effect, Layer } from 'effect';
import { Chat } from './chat';
import { Coaching } from './coaching';
import { Db } from './db';
import { Notifications } from './notifications';
import { TestDb } from './testing';
import { Users } from './users';
import { Videos } from './videos';

const Live = Layer.mergeAll(Users.layer, Coaching.layer, Chat.layer, Notifications.layer, Videos.layer).pipe(Layer.provideMerge(TestDb));

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
	// Read receipts. A read marks only what the reader had loaded and on screen: the `from`..`upTo` range, in one thread.
	it.effect('a read marks only the other side\'s messages in range and thread, and only a full read clears the notification', () =>
		Effect.gen(function* () {
			const { coach, player, chat, conversation, notifications } = yield* setup('rr1');
			const sendP = (body: string) => chat.send({ conversation, senderId: player.id, senderName: 'Pat', body }).pipe(Effect.map((r) => (r._tag === 'Sent' ? r.message : (undefined as never))));
			const m1 = yield* sendP('one');
			const m2 = yield* sendP('two');
			const m3 = yield* sendP('three');
			const readAt = () => chat.messages(conversation.id, { limit: 50 }).pipe(Effect.map((p) => p.messages.map((m) => m.readAt !== null)));
			assert.deepStrictEqual(yield* readAt(), [false, false, false]);
			// the coach had m1..m2 on screen; m3 arrived after: it stays unread, and so does the notification
			assert.deepStrictEqual(yield* chat.markRead(conversation, coach.id, 'general', { from: m1.seq, upTo: m2.seq }), { marked: 2 });
			assert.deepStrictEqual(yield* readAt(), [true, true, false]);
			assert.strictEqual(yield* notifications.unreadCount(coach.id), 1);
			assert.strictEqual(yield* chat.unreadFor(coach.id), 1);
			// repeating the same range changes nothing
			assert.deepStrictEqual(yield* chat.markRead(conversation, coach.id, 'general', { from: m1.seq, upTo: m2.seq }), { marked: 0 });
			// the sender's own read marks nothing of their own messages
			assert.deepStrictEqual(yield* chat.markRead(conversation, player.id, 'general', { upTo: m3.seq }), { marked: 0 });
			assert.deepStrictEqual(yield* readAt(), [true, true, false]);
			yield* chat.markRead(conversation, coach.id, 'general', { from: m3.seq, upTo: m3.seq });
			assert.deepStrictEqual(yield* readAt(), [true, true, true]);
			assert.strictEqual(yield* notifications.unreadCount(coach.id), 0);
		})
	);

	it.effect('receipts list only the caller\'s own read messages in the thread, from a cursor', () =>
		Effect.gen(function* () {
			const { coach, player, chat, conversation } = yield* setup('rr2');
			const a = yield* chat.send({ conversation, senderId: coach.id, senderName: 'T', body: 'a' });
			const b = yield* chat.send({ conversation, senderId: coach.id, senderName: 'T', body: 'b' });
			yield* chat.send({ conversation, senderId: coach.id, senderName: 'T', body: 'c' });
			if (a._tag !== 'Sent' || b._tag !== 'Sent') return assert.fail('send');
			assert.deepStrictEqual(yield* chat.receipts(conversation, coach.id, 'general', 0), []);
			yield* chat.markRead(conversation, player.id, 'general', { upTo: b.message.seq });
			const mine = yield* chat.receipts(conversation, coach.id, 'general', 0);
			assert.deepStrictEqual(mine.map((r) => r.id), [a.message.id, b.message.id]);
			assert.deepStrictEqual((yield* chat.receipts(conversation, coach.id, 'general', b.message.seq)).map((r) => r.id), [b.message.id]);
			// a reader sees none of the sender's receipts as their own, and another thread is separate
			assert.deepStrictEqual(yield* chat.receipts(conversation, player.id, 'general', 0), []);
			assert.deepStrictEqual(yield* chat.receipts(conversation, coach.id, { videoId: '00000000-0000-4000-8000-0000000000aa' }, 0), []);
		})
	);

	it.effect('sending reads only what the sender had on screen: a message that arrived while they typed stays unread', () =>
		Effect.gen(function* () {
			const { coach, player, chat, conversation } = yield* setup('rr3');
			const sent = (r: any) => (r._tag === 'Sent' ? r.message : (undefined as never));
			const p1 = sent(yield* chat.send({ conversation, senderId: player.id, senderName: 'P', body: 'p1' }));
			const p2 = sent(yield* chat.send({ conversation, senderId: player.id, senderName: 'P', body: 'p2' })); // arrives while the coach types
			// the coach had p1 on screen when they sent
			yield* chat.send({ conversation, senderId: coach.id, senderName: 'T', body: 'reply', seenSeq: p1.seq, seenFromSeq: p1.seq });
			const all = (yield* chat.messages(conversation.id, { limit: 50 })).messages;
			assert.deepStrictEqual(all.map((m) => [m.body, m.readAt !== null]), [['p1', true], ['p2', false], ['reply', false]]);
			assert.isTrue(p2.seq > p1.seq);
			// no range: everything before the new message (the plain API behaviour)
			yield* chat.send({ conversation, senderId: coach.id, senderName: 'T', body: 'again' });
			assert.isTrue((yield* chat.messages(conversation.id, { limit: 50 })).messages.find((m) => m.body === 'p2')!.readAt !== null);
		})
	);

	it.effect('a long ping-pong across the general thread and a video thread keeps every message\'s seen state exact', () =>
		Effect.gen(function* () {
			const { coach, player, chat, conversation, db } = yield* setup('rr4');
			const video = yield* (yield* Videos).create({ id: '00000000-0000-4000-8000-00000000f0f0', ownerId: player.id, kind: 'swing', sourceKey: 'raw/x/source.mp4', sizeBytes: 1 });
			const threads: (string | null)[] = [null, video.id];
			// seeded PRNG: the same script every run
			let seed = 20261102;
			const rnd = (n: number) => ((seed = (seed * 1664525 + 1013904223) >>> 0), (seed >>> 16) % n);
			type M = { id: string; seq: number; by: 'coach' | 'player'; video: string | null; read: boolean };
			const model: M[] = [];
			const idOf = { coach: coach.id, player: player.id };
			const other = (by: 'coach' | 'player') => (by === 'coach' ? 'player' : 'coach');
			const scopeOf = (v: string | null) => (v === null ? ('general' as const) : { videoId: v });
			/** The reader's loaded window: some tail of the thread up to a (possibly stale) newest seq. */
			const window = (v: string | null, staleBy: number) => {
				const inThread = model.filter((m) => m.video === v).map((m) => m.seq);
				if (inThread.length === 0) return undefined;
				const hi = inThread[Math.max(0, inThread.length - 1 - staleBy)]!;
				const lo = inThread[Math.max(0, inThread.length - 1 - staleBy - rnd(6))]!;
				return { from: lo, upTo: hi };
			};
			const mark = (reader: 'coach' | 'player', v: string | null, range: { from: number; upTo: number } | undefined) => {
				for (const m of model) if (m.by !== reader && m.video === v && !m.read && (!range || (m.seq >= range.from && m.seq <= range.upTo))) m.read = true;
			};
			const verify = (label: string) =>
				Effect.gen(function* () {
					const actual = (yield* chat.messages(conversation.id, { limit: 100 })).messages;
					assert.deepStrictEqual(
						actual.map((m) => [m.seq, m.readAt !== null]),
						model.map((m) => [m.seq, m.read]),
						label
					);
				});

			let mixed = 0;
			for (let step = 0; step < 40; step++) {
				const by = rnd(2) === 0 ? 'coach' : 'player';
				const v = threads[rnd(2)]!;
				const win = window(v, rnd(3));
				// the per-minute send limit is not what is under test: age the messages
				yield* db.query(`update messages set created_at = created_at - interval '2 minutes' where conversation_id = $1`, [conversation.id]);
				if (rnd(10) < 5) {
					// A send reads the other side's messages of its thread in [seenFrom, min(seenSeq, new)] (everything before it without a range).
					const useWin = win !== undefined && rnd(4) > 0;
					const r = yield* chat.send({ conversation, senderId: idOf[by], senderName: by, body: `s${step}`, ...(v ? { videoId: v } : {}), ...(useWin ? { seenSeq: win.upTo, seenFromSeq: win.from } : {}) });
					assert.strictEqual(r._tag, 'Sent');
					if (r._tag !== 'Sent') return;
					mark(by, v, { from: useWin ? win.from : 0, upTo: useWin ? Math.min(win.upTo, r.message.seq) : r.message.seq });
					model.push({ id: r.message.id, seq: r.message.seq, by, video: v, read: false });
				} else {
					const full = rnd(5) === 0;
					yield* chat.markRead(conversation, idOf[by], scopeOf(v), full ? undefined : win);
					mark(by, v, full ? undefined : win);
				}
				yield* verify(`after step ${step}`);
				if (model.some((m) => m.read) && model.some((m) => !m.read)) mixed++;
			}
			// monotonic and sane: both sides saw some and left some unread
			assert.isAbove(mixed, 15);
			// receipts agree with the messages for each side and thread
			for (const by of ['coach', 'player'] as const) {
				for (const v of threads) {
					const expected = model.filter((m) => m.by === by && m.video === v && m.read).map((m) => m.id);
					const got = (yield* chat.receipts(conversation, idOf[by], scopeOf(v), 0)).map((r) => r.id);
					assert.deepStrictEqual(got, expected.slice(-500));
				}
			}
			// unread counts per side agree with the model
			for (const reader of ['coach', 'player'] as const) {
				const expected = model.filter((m) => m.by === other(reader) && !m.read).length;
				assert.strictEqual(yield* chat.unreadFor(idOf[reader]), expected);
			}
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
