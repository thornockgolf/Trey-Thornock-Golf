import { Billing, Chat, Coaching, Db, Notifications, Realtime, Users, Videos } from '@ttg/db';
import { TestDb } from '@ttg/db/testing';
import { Effect, Layer, ManagedRuntime } from 'effect';
import { afterAll, describe, expect, it } from 'vitest';
import { CoachAllowlist } from './auth';
import { describeNotification } from '@ttg/shared';
import { getUnread, listConversations, listMessages, markConversationRead, sendMessage, videoPageThread } from './chat';
import { listNotifications, markNotificationsRead } from './notifications';
import { mintRealtimeToken } from './realtime';
import { makeRunRoute } from './run-route';
import { fakeEvent, grantAccess } from './test-utils';

// Integration: chat, notifications and Realtime tokens on a real database. Publishing goes to a recording fetch.
const published: { topic: string; event: string; payload: any }[] = [];
const fakeFetch = (async (_url: string, init: { body: string }) => {
	for (const m of JSON.parse(init.body).messages) published.push(m);
	return new Response(null, { status: 202 });
}) as unknown as typeof fetch;
const RealtimeLive = Realtime.layerEnabled({ url: 'http://rt.test', serviceRoleKey: 'svc', jwtSecret: 'jwt-secret', anonKey: 'anon', fetch: fakeFetch });
const Services = Layer.mergeAll(Users.layer, Videos.layer, Coaching.layer, Chat.layer, Notifications.layer, Billing.layer).pipe(Layer.provideMerge(TestDb));
const rt = ManagedRuntime.make(Layer.mergeAll(CoachAllowlist.layerFromCsv('coach_a'), RealtimeLive).pipe(Layer.provideMerge(Services)));
const run = makeRunRoute(rt);
afterAll(() => rt.dispose());

const call = async (effect: Effect.Effect<any, any, any>, user: string | null, o: { params?: Record<string, string>; body?: unknown; query?: string } = {}) => {
	const res = await run(fakeEvent({ userId: user, params: o.params, body: o.body, query: o.query === undefined ? undefined : (o.query.startsWith('?') ? o.query : `?${o.query}`) }), effect as never);
	return { status: res.status, body: (await res.json()) as any };
};
const user = (clerk: string, role: 'player' | 'coach' = 'player') => rt.runPromise(Effect.flatMap(Users, (u) => u.ensure({ clerkUserId: clerk, role })));
/** A coach and a player who are paired, with the player paying for membership (unless `paid` is false). */
const pair = async (tag: string, paid = true) => {
	const coach = await user('coach_a', 'coach');
	const player = await user(`pl_${tag}`);
	await rt.runPromise(Effect.flatMap(Coaching, (c) => c.assign(coach.id, player.id)));
	if (paid) await rt.runPromise(grantAccess(player.id));
	const conversation = (await call(listConversations, `pl_${tag}`)).body.conversations[0];
	return { coach, player, id: conversation.id as string };
};
const send = (clerk: string, id: string, body: unknown) => call(sendMessage, clerk, { params: { id }, body });

describe('chat', () => {
	it('stores a message from the player, shows it to the coach, and pushes it on the conversation channel', async () => {
		const { id, player } = await pair('c1');
		published.length = 0;
		const sent = await send('pl_c1', id, { body: '  Fat shots with my 7 iron  ' });
		expect(sent.status).toBe(200);
		expect(sent.body).toMatchObject({ body: 'Fat shots with my 7 iron', senderId: player.id, videoId: null });
		const seen = await call(listMessages, 'coach_a', { params: { id } });
		expect(seen.body.messages.map((m: any) => m.body)).toEqual(['Fat shots with my 7 iron']);
		expect(published.map((p) => [p.topic, p.event])).toEqual([
			[`conversation:${id}`, 'message.created'],
			[expect.stringMatching(/^user:/), 'notification.created']
		]);
		expect(published[0]!.payload.id).toBe(sent.body.id);
	});

	it('refuses everyone who is not in the conversation, for reading, sending, marking read and tokens', async () => {
		const { id } = await pair('c2');
		await user('pl_stranger');
		await user('coach_b', 'coach');
		for (const who of ['pl_stranger', 'coach_b']) {
			expect((await call(listMessages, who, { params: { id } })).status).toBe(403);
			expect((await send(who, id, { body: 'hi' })).status).toBe(403);
			expect((await call(markConversationRead, who, { params: { id } })).status).toBe(403);
			expect((await call(mintRealtimeToken, who, { body: { channel: 'conversation', conversationId: id } })).status).toBe(403);
		}
		expect((await call(listMessages, 'coach_a', { params: { id: 'not-a-uuid' } })).status).toBe(404);
		expect((await call(listMessages, 'pl_c2', { params: { id: '00000000-0000-4000-8000-000000000000' } })).status).toBe(404);
		expect((await call(listMessages, null, { params: { id } })).status).toBe(401);
		expect((await call(listConversations, 'pl_stranger')).body.conversations).toEqual([]);
	});

	it('catches up by cursor without duplicates and pages back', async () => {
		const { id } = await pair('c3');
		for (let i = 1; i <= 4; i++) await send('pl_c3', id, { body: `m${i}` });
		const first = await call(listMessages, 'coach_a', { params: { id }, query: '?limit=2' });
		expect(first.body.messages.map((m: any) => m.body)).toEqual(['m3', 'm4']);
		expect(first.body.hasMore).toBe(true);
		const back = await call(listMessages, 'coach_a', { params: { id }, query: `?limit=5&before=${first.body.messages[0].seq}` });
		expect(back.body.messages.map((m: any) => m.body)).toEqual(['m1', 'm2']);
		await send('pl_c3', id, { body: 'm5' });
		const after = await call(listMessages, 'coach_a', { params: { id }, query: `?after=${first.body.messages[1].seq}` });
		expect(after.body.messages.map((m: any) => m.body)).toEqual(['m5']);
		expect((await call(listMessages, 'coach_a', { params: { id }, query: '?after=-1' })).status).toBe(422);
		expect((await call(listMessages, 'coach_a', { params: { id }, query: '?limit=0' })).status).toBe(422);
	});

	it('validates the message: 1 to 4000 characters, a video reference needs a video the conversation may use', async () => {
		const { id, player } = await pair('c4');
		expect((await send('pl_c4', id, { body: '' })).status).toBe(422);
		expect((await send('pl_c4', id, { body: '   ' })).status).toBe(422);
		expect((await send('pl_c4', id, { body: 'x'.repeat(4001) })).status).toBe(422);
		expect((await send('pl_c4', id, { body: 'x'.repeat(4000) })).status).toBe(200);
		expect((await send('pl_c4', id, { body: 'hi', videoMs: 3200 })).status).toBe(422); // time without a video
		expect((await send('pl_c4', id, { body: 'hi', videoId: 'nope' })).status).toBe(422);
		const own = '00000000-0000-4000-8000-00000000c401';
		const foreign = '00000000-0000-4000-8000-00000000c402';
		const other = await user('pl_c4_other');
		await rt.runPromise(
			Effect.flatMap(Videos, (v) =>
				Effect.all([
					v.create({ id: own, ownerId: player.id, kind: 'swing', sourceKey: 'raw/a.mp4', sizeBytes: 1 }),
					v.create({ id: foreign, ownerId: other.id, kind: 'swing', sourceKey: 'raw/b.mp4', sizeBytes: 1 })
				])
			)
		);
		const ok = await send('coach_a', id, { body: 'Look at 3.2 s', videoId: own, videoMs: 3200 });
		expect(ok.status).toBe(200);
		expect(ok.body).toMatchObject({ videoId: own, videoMs: 3200 });
		expect((await send('coach_a', id, { body: 'no', videoId: foreign, videoMs: 100 })).status).toBe(422);
		expect((await send('pl_c4', id, { body: 'hi', videoId: own, videoMs: -1 })).status).toBe(422);
	});

	it('answers 402 with a billing link to a player without a membership, but lets the coach write', async () => {
		const { id } = await pair('c5', false);
		const blocked = await send('pl_c5', id, { body: 'hello' });
		expect(blocked.status).toBe(402);
		expect(blocked.body).toMatchObject({ code: 'PaymentError', billingUrl: '/billing' });
		expect((await send('coach_a', id, { body: 'welcome' })).status).toBe(200);
		// assessment alone does not unlock chat either
		const player = await user('pl_c5');
		await rt.runPromise(grantAccess(player.id, 'assessment'));
		expect((await send('pl_c5', id, { body: 'hello' })).status).toBe(402);
		// the player can still read
		expect((await call(listMessages, 'pl_c5', { params: { id } })).body.messages).toHaveLength(1);
	});

	it('blocks the player after the grace period of a failed payment, not before', async () => {
		const { id, player } = await pair('c6');
		const fail = (ageDays: number) =>
			rt.runPromise(
				Effect.flatMap(Effect.service(Billing), (b) => b.processEvent({ id: `e_c6_${ageDays}`, type: 't' }, (tx) => tx.markPastDue(`sub_test_${player.id}`, new Date())))
			);
		await fail(0);
		expect((await send('pl_c6', id, { body: 'still ok in grace' })).status).toBe(200);
		// push the start of the past_due period beyond the grace window
		await rt.runPromise(Effect.flatMap(Db, (db) => db.query(`update subscriptions set past_due_since = now() - interval '8 days' where user_id = $1`, [player.id])));
		const blocked = await send('pl_c6', id, { body: 'now blocked' });
		expect(blocked.status).toBe(402);
		expect(blocked.body.message).toMatch(/payment failed/i);
	});

	it('stops writes when the coaching relationship has ended but keeps the history readable', async () => {
		const { id, coach, player } = await pair('c7');
		await send('pl_c7', id, { body: 'before' });
		await rt.runPromise(Effect.flatMap(Coaching, (c) => c.end(coach.id, player.id)));
		expect((await send('pl_c7', id, { body: 'after' })).status).toBe(403);
		expect((await send('coach_a', id, { body: 'after' })).status).toBe(403);
		expect((await call(listMessages, 'pl_c7', { params: { id } })).body.messages).toHaveLength(1);
	});

	it('rate limits a user at 30 messages a minute with 429', async () => {
		const { id } = await pair('c8');
		for (let i = 0; i < 30; i++) expect((await send('pl_c8', id, { body: `m${i}` })).status).toBe(200);
		const limited = await send('pl_c8', id, { body: 'one too many' });
		expect(limited.status).toBe(429);
		expect(limited.body.code).toBe('RateLimited');
		expect((await send('coach_a', id, { body: 'the coach has their own allowance' })).status).toBe(200);
	});
});

describe('unread and notifications', () => {
	it('counts unread from Postgres, clears them when the conversation is opened, and keeps one notification per conversation', async () => {
		const { id } = await pair('n1');
		await send('pl_n1', id, { body: 'one' });
		await send('pl_n1', id, { body: 'two' });
		expect((await call(getUnread, 'coach_a')).body.messages).toBeGreaterThanOrEqual(2);
		const convo = (await call(listConversations, 'coach_a')).body.conversations.find((c: any) => c.id === id);
		expect(convo.unread).toBe(2);
		const notes = (await call(listNotifications, 'coach_a')).body.notifications.filter((n: any) => n.type === 'message' && n.payload.conversationId === id);
		expect(notes).toHaveLength(1);
		expect(notes[0].payload.count).toBe(2);
		expect((await call(getUnread, 'pl_n1')).body.messages).toBe(0);
		const before = (await call(getUnread, 'coach_a')).body;
		const read = await call(markConversationRead, 'coach_a', { params: { id } });
		expect(read.body.unread.messages).toBe(before.messages - 2);
		expect(read.body.unread.notifications).toBe(before.notifications - 1);
		expect((await call(listConversations, 'coach_a')).body.conversations.find((c: any) => c.id === id).unread).toBe(0);
	});

	it('lists only the caller\'s notifications and marks only theirs read', async () => {
		const a = await user('pl_n2a');
		const b = await user('pl_n2b');
		const mk = (uid: string) => rt.runPromise(Effect.flatMap(Notifications, (n) => n.create(uid, 'plan_assigned', { planTitle: 'T' })));
		const na = await mk(a.id);
		const nb = await mk(b.id);
		const list = await call(listNotifications, 'pl_n2a');
		expect(list.body.notifications.map((n: any) => n.id)).toEqual([na.id]);
		expect(list.body.unread).toBe(1);
		expect((await call(markNotificationsRead, 'pl_n2a', { body: { ids: [nb.id] } })).body).toEqual({ updated: 0, unread: 1 });
		expect((await call(listNotifications, 'pl_n2b')).body.unread).toBe(1);
		expect((await call(markNotificationsRead, 'pl_n2a', { body: { ids: [na.id] } })).body).toEqual({ updated: 1, unread: 0 });
		expect((await call(markNotificationsRead, 'pl_n2a', { body: { ids: [] } })).status).toBe(422);
		expect((await call(markNotificationsRead, 'pl_n2a', { body: { ids: ['nope'] } })).status).toBe(422);
		await mk(a.id);
		expect((await call(markNotificationsRead, 'pl_n2a', { body: { all: true } })).body).toEqual({ updated: 1, unread: 0 });
		expect((await call(listNotifications, null)).status).toBe(401);
	});
});

describe('realtime tokens', () => {
	const claims = (jwt: string) => JSON.parse(Buffer.from(jwt.split('.')[1]!, 'base64url').toString());

	it('mints a 5 minute token for the conversation or for the user\'s own channel only', async () => {
		const { id, player } = await pair('t1');
		const conv = await call(mintRealtimeToken, 'pl_t1', { body: { channel: 'conversation', conversationId: id } });
		expect(conv.status).toBe(200);
		expect(conv.body).toMatchObject({ enabled: true, topic: `conversation:${id}`, url: 'http://rt.test', anonKey: 'anon' });
		const c = claims(conv.body.token);
		expect(c).toMatchObject({ role: 'authenticated', sub: player.id, topic: `conversation:${id}` });
		expect(c.exp - c.iat).toBeLessThanOrEqual(300);
		const mine = await call(mintRealtimeToken, 'pl_t1', { body: { channel: 'user' } });
		expect(claims(mine.body.token).topic).toBe(`user:${player.id}`);
		expect((await call(mintRealtimeToken, 'pl_t1', { body: { channel: 'user', userId: 'someone-else' } })).body.topic).toBe(`user:${player.id}`);
		expect((await call(mintRealtimeToken, 'pl_t1', { body: { channel: 'other' } })).status).toBe(422);
		expect((await call(mintRealtimeToken, null, { body: { channel: 'user' } })).status).toBe(401);
	});
});

describe('video threads', () => {
	const vid = (id: string, ownerId: string, kind: 'swing' | 'reference' = 'swing') =>
		rt.runPromise(Effect.flatMap(Videos, (v) => v.create({ id, ownerId, kind, sourceKey: `raw/${id}.mp4`, sizeBytes: 1 })));
	const V1 = '00000000-0000-4000-8000-00000000d101';
	const V2 = '00000000-0000-4000-8000-00000000d102';
	const REF = '00000000-0000-4000-8000-00000000d103';

	it('keeps a video\'s messages out of the general thread, and the other way round', async () => {
		const { id, player } = await pair('v1');
		await vid(V1, player.id);
		await vid(V2, player.id);
		await send('pl_v1', id, { body: 'general hello' });
		await send('pl_v1', id, { body: 'about v1', videoId: V1, videoMs: 4250 });
		await send('coach_a', id, { body: 'reply on v1', videoId: V1 });
		await send('coach_a', id, { body: 'about v2', videoId: V2 });
		const bodies = async (clerk: string, query?: string) => (await call(listMessages, clerk, { params: { id }, query })).body.messages.map((m: any) => m.body);
		expect(await bodies('coach_a', `videoId=${V1}`)).toEqual(['about v1', 'reply on v1']);
		expect(await bodies('pl_v1', `videoId=${V2}`)).toEqual(['about v2']);
		expect(await bodies('pl_v1', 'scope=general')).toEqual(['general hello']);
		expect(await bodies('pl_v1')).toHaveLength(4);
		// the cursor works inside a thread
		const first = (await call(listMessages, 'pl_v1', { params: { id }, query: `videoId=${V1}` })).body.messages[0];
		expect(await bodies('pl_v1', `videoId=${V1}&after=${first.seq}`)).toEqual(['reply on v1']);
		// the conversation summary (the Messages tab entry) shows only the general thread
		const convo = (await call(listConversations, 'pl_v1')).body.conversations[0];
		expect(convo.lastMessage.body).toBe('general hello');
		expect(convo.unread).toBe(0);
		expect(convo.videoUnread).toBe(2);
		expect(convo.videoUnreadVideoId).toBe(V2);
		expect((await call(listMessages, 'pl_v1', { params: { id }, query: 'videoId=nope' })).status).toBe(422);
		expect((await call(listMessages, 'pl_v1', { params: { id }, query: 'scope=other' })).status).toBe(422);
	});

	it('counts video messages in the badge, and each thread is read on its own', async () => {
		const { id, player } = await pair('v2');
		await vid('00000000-0000-4000-8000-00000000d111', player.id);
		const v = '00000000-0000-4000-8000-00000000d111';
		await send('coach_a', id, { body: 'general note' });
		await send('coach_a', id, { body: 'video note', videoId: v });
		await send('coach_a', id, { body: 'video note 2', videoId: v, videoMs: 100 });
		expect((await call(getUnread, 'pl_v2')).body.messages).toBe(3);
		const note = async () => (await call(listNotifications, 'pl_v2')).body.notifications.filter((n: any) => n.type === 'message');
		const all = await note();
		expect(all).toHaveLength(2);
		expect(all.find((n: any) => n.payload.videoId === v).payload.count).toBe(2);
		// opening the video clears only that thread
		const read = await call(markConversationRead, 'pl_v2', { params: { id }, query: `videoId=${v}` });
		expect(read.body.unread.messages).toBe(1);
		expect((await note()).filter((n: any) => !n.readAt)).toHaveLength(1);
		expect((await call(listConversations, 'pl_v2')).body.conversations[0]).toMatchObject({ unread: 1, videoUnread: 0 });
		await call(markConversationRead, 'pl_v2', { params: { id }, query: 'scope=general' });
		expect((await call(getUnread, 'pl_v2')).body.messages).toBe(0);
		// replying in a thread means the sender has seen it
		await send('coach_a', id, { body: 'again', videoId: v });
		await send('pl_v2', id, { body: 'thanks', videoId: v });
		expect((await call(getUnread, 'pl_v2')).body.messages).toBe(0);
	});

	it('points the notification at the video, for the coach and the player', async () => {
		const { id, player } = await pair('v3');
		await vid('00000000-0000-4000-8000-00000000d121', player.id);
		await send('pl_v3', id, { body: 'look', videoId: '00000000-0000-4000-8000-00000000d121' });
		const n = (await call(listNotifications, 'coach_a')).body.notifications.find((x: any) => x.type === 'message' && x.payload.videoId);
		expect(describeNotification(n).href).toBe('/videos/00000000-0000-4000-8000-00000000d121');
	});

	it('is participant-only: nobody else reads, writes or marks a video thread read, and the owner\'s thread follows the video', async () => {
		const { id, player } = await pair('v4');
		await vid('00000000-0000-4000-8000-00000000d131', player.id);
		const v = '00000000-0000-4000-8000-00000000d131';
		await user('pl_v4_other');
		await user('coach_b', 'coach');
		for (const who of ['pl_v4_other', 'coach_b']) {
			expect((await call(listMessages, who, { params: { id }, query: `videoId=${v}` })).status).toBe(403);
			expect((await send(who, id, { body: 'x', videoId: v })).status).toBe(403);
			expect((await call(markConversationRead, who, { params: { id }, query: `videoId=${v}` })).status).toBe(403);
		}
		// a message cannot point at someone else's video
		const other = await user('pl_v4_other');
		await vid('00000000-0000-4000-8000-00000000d132', other.id);
		expect((await send('pl_v4', id, { body: 'x', videoId: '00000000-0000-4000-8000-00000000d132' })).status).toBe(422);
	});

	it('answers 402 for a player without a membership when writing in a video thread, but reads stay open', async () => {
		const { id, player } = await pair('v5', false);
		const v = '00000000-0000-4000-8000-00000000d141';
		await vid(v, player.id);
		const blocked = await send('pl_v5', id, { body: 'hi', videoId: v });
		expect(blocked.status).toBe(402);
		expect(blocked.body.billingUrl).toBe('/billing');
		await send('coach_a', id, { body: 'welcome', videoId: v });
		expect((await call(listMessages, 'pl_v5', { params: { id }, query: `videoId=${v}` })).body.messages).toHaveLength(1);
	});

	it('loads a video page thread for the owner and the coach, and nothing for a reference clip or a player without a coach', async () => {
		const { id, player, coach } = await pair('v6');
		const v = '00000000-0000-4000-8000-00000000d151';
		await vid(v, player.id);
		await send('coach_a', id, { body: 'on the video', videoId: v });
		await send('coach_a', id, { body: 'general' });
		for (const who of ['pl_v6', 'coach_a']) {
			const page = await call(videoPageThread, who, { params: { id: v } });
			expect(page.status).toBe(200);
			expect(page.body.messages.map((m: any) => m.body)).toEqual(['on the video']);
			expect(page.body.conversation.id).toBe(id);
			expect(page.body.compose.allowed).toBe(true);
		}
		await vid(REF, coach.id, 'reference');
		expect((await call(videoPageThread, 'pl_v6', { params: { id: REF } })).body).toBeNull();
		// a player with no coach gets the empty state, not an error
		const loner = await user('pl_v6_loner');
		const lv = '00000000-0000-4000-8000-00000000d152';
		await vid(lv, loner.id);
		expect((await call(videoPageThread, 'pl_v6_loner', { params: { id: lv } })).body).toEqual({ noCoach: true });
		// someone else's video is not viewable at all
		await user('pl_v6_nosy');
		expect((await call(videoPageThread, 'pl_v6_nosy', { params: { id: v } })).status).toBe(403);
	});
});
