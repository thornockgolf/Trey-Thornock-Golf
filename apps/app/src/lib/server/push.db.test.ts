import { Billing, Chat, Coaching, Notifications, PushSubscriptions, Realtime, Users, Videos, WebPush } from '@ttg/db';
import { TestDb } from '@ttg/db/testing';
import { Effect, Layer, ManagedRuntime } from 'effect';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { CoachAllowlist } from './auth';
import { listConversations, sendMessage } from './chat';
import { getPushConfig, subscribePush, unsubscribePush } from './push';
import { makeRunRoute } from './run-route';
import { fakeEvent, grantAccess } from './test-utils';

// Integration: the push endpoints and the send from a stored notification, on a real database with a recording sender.
// Real delivery to a browser's push service is not tested here.
const sent: { endpoint: string; body: any }[] = [];
const fakeSend = async (sub: { endpoint: string }, body: string) => void sent.push({ endpoint: sub.endpoint, body: JSON.parse(body) });
const Subs = Layer.mergeAll(Users.layer, Videos.layer, Coaching.layer, Chat.layer, Notifications.layer, Billing.layer, PushSubscriptions.layer).pipe(Layer.provideMerge(TestDb));
const WebPushLive = WebPush.layerEnabled({ publicKey: 'BPublicKey', privateKey: 'priv', subject: 'mailto:x@example.com', send: fakeSend });
const rt = ManagedRuntime.make(Layer.mergeAll(CoachAllowlist.layerFromCsv('coach_a'), Realtime.layerDisabled, WebPushLive.pipe(Layer.provide(Subs))).pipe(Layer.provideMerge(Subs)));
const run = makeRunRoute(rt);
afterAll(() => rt.dispose());

const call = async (effect: Effect.Effect<any, any, any>, user: string | null, o: { params?: Record<string, string>; body?: unknown } = {}) => {
	const res = await run(fakeEvent({ userId: user, params: o.params, body: o.body }), effect as never);
	return { status: res.status, body: (await res.json()) as any };
};
const keys = { p256dh: 'B'.repeat(87), auth: 'a'.repeat(22) };
const ep = (n: number) => `https://fcm.googleapis.com/fcm/send/${n}`;
const listFor = (clerk: string) =>
	rt.runPromise(
		Effect.gen(function* () {
			const u = yield* (yield* Users).ensure({ clerkUserId: clerk, role: 'player' });
			return (yield* (yield* PushSubscriptions).listFor(u.id)).map((s) => s.endpoint);
		})
	);

describe('web push endpoints', () => {
	it('tells a signed-in user the public key, and nobody else', async () => {
		expect((await call(getPushConfig, null)).status).toBe(401);
		expect((await call(getPushConfig, 'pl_cfg')).body).toEqual({ enabled: true, publicKey: 'BPublicKey' });
	});

	it('stores the subscription for the session\'s user only, and removes only their own', async () => {
		expect((await call(subscribePush, null, { body: { endpoint: ep(1), keys } })).status).toBe(401);
		expect((await call(subscribePush, 'pl_s1', { body: { endpoint: ep(1), keys } })).status).toBe(200);
		expect(await listFor('pl_s1')).toEqual([ep(1)]);
		// somebody else cannot remove it by naming the endpoint
		expect((await call(unsubscribePush, 'pl_s2', { body: { endpoint: ep(1) } })).body).toEqual({ removed: false });
		expect(await listFor('pl_s1')).toEqual([ep(1)]);
		expect((await call(unsubscribePush, 'pl_s1', { body: { endpoint: ep(1) } })).body).toEqual({ removed: true });
		expect(await listFor('pl_s1')).toEqual([]);
	});

	it('refuses an endpoint that is not a push service, and malformed keys', async () => {
		for (const endpoint of ['http://fcm.googleapis.com/x', 'https://169.254.169.254/latest', 'https://evil.example.com/x']) {
			const r = await call(subscribePush, 'pl_bad', { body: { endpoint, keys } });
			expect([r.status, r.body.message], endpoint).toEqual([422, 'Invalid request: check endpoint']);
		}
		expect((await call(subscribePush, 'pl_bad', { body: { endpoint: ep(2), keys: { p256dh: 'short', auth: '!' } } })).status).toBe(422);
		expect(await listFor('pl_bad')).toEqual([]);
	});

	it('answers 409 when push is not set up on the server', async () => {
		const off = ManagedRuntime.make(Layer.mergeAll(CoachAllowlist.layerFromCsv(''), WebPush.layerDisabled).pipe(Layer.provideMerge(Subs)));
		const res = await makeRunRoute(off)(fakeEvent({ userId: 'pl_off', body: { endpoint: ep(3), keys } }), subscribePush as never);
		expect(res.status).toBe(409);
		const cfg = await (await makeRunRoute(off)(fakeEvent({ userId: 'pl_off' }), getPushConfig as never)).json();
		expect(cfg).toEqual({ enabled: false, publicKey: null });
		await off.dispose();
	}, 30_000); // builds a second throwaway database
});

describe('web push from a notification', () => {
	it('sends a chat message notification to the recipient\'s devices, not the sender\'s', async () => {
		const coach = await rt.runPromise(Effect.flatMap(Users, (u) => u.ensure({ clerkUserId: 'coach_a', role: 'coach' })));
		const player = await rt.runPromise(Effect.flatMap(Users, (u) => u.ensure({ clerkUserId: 'pl_chat', role: 'player' })));
		await rt.runPromise(Effect.flatMap(Coaching, (c) => c.assign(coach.id, player.id)));
		await rt.runPromise(grantAccess(player.id));
		await call(subscribePush, 'coach_a', { body: { endpoint: ep(10), keys } });
		await call(subscribePush, 'pl_chat', { body: { endpoint: ep(11), keys } });
		const id = (await call(listConversations, 'pl_chat')).body.conversations[0].id;
		sent.length = 0;
		const res = await call(sendMessage, 'pl_chat', { params: { id }, body: { body: 'Fat shots with my 7 iron' } });
		expect(res.status).toBe(200);
		// push is sent after the response, in a detached fiber
		await vi.waitFor(() => expect(sent).toHaveLength(1));
		expect(sent[0]!.endpoint).toBe(ep(10));
		expect(sent[0]!.body).toMatchObject({ href: `/messages/${id}`, tag: `conversation-${id}` });
		expect(sent[0]!.body.title).toMatch(/^New message from /);
		// the message text is not in the push
		expect(JSON.stringify(sent[0])).not.toContain('Fat shots');
	});
});
