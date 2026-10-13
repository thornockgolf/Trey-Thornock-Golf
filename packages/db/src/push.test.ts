import { assert, layer } from '@effect/vitest';
import { Effect, Layer } from 'effect';
import { Db } from './db';
import type { Notification } from './notifications';
import { PushSubscriptions, WebPush, pushPayloadFor } from './push';
import { TestDb } from './testing';
import { Users } from './users';

const sent: { endpoint: string; body: string; topic?: string }[] = [];
let failWith: Record<string, { statusCode: number }> = {};
const fakeSend = async (sub: { endpoint: string }, body: string, options: { topic?: string }) => {
	sent.push({ endpoint: sub.endpoint, body, topic: options.topic });
	const f = failWith[sub.endpoint];
	if (f) throw Object.assign(new Error('push failed'), f);
};

const Subs = PushSubscriptions.layer.pipe(Layer.provideMerge(Users.layer), Layer.provideMerge(TestDb));
const Live = WebPush.layerEnabled({ publicKey: 'pub', privateKey: 'priv', subject: 'mailto:coach@example.com', send: fakeSend }).pipe(Layer.provideMerge(Subs));

const ep = (n: number) => `https://fcm.googleapis.com/fcm/send/${n}`;
const note = (userId: string, over: Partial<Notification> = {}): Notification => ({
	id: 'n1',
	userId,
	type: 'video_ready',
	payload: { videoId: 'v1', title: 'Driver' },
	readAt: null,
	createdAt: new Date(),
	...over
});

layer(Live, { timeout: 60_000 })('Web push', (it) => {
	it.effect('saves, moves and removes subscriptions, keeping the newest ten', () =>
		Effect.gen(function* () {
			const users = yield* Users;
			const subs = yield* PushSubscriptions;
			const a = yield* users.ensure({ clerkUserId: 'push_a', role: 'player' });
			const b = yield* users.ensure({ clerkUserId: 'push_b', role: 'player' });
			yield* subs.save({ userId: a.id, endpoint: ep(1), p256dh: 'k', auth: 'a' });
			yield* subs.save({ userId: a.id, endpoint: ep(1), p256dh: 'k2', auth: 'a2' }); // same browser again: one row
			assert.deepStrictEqual((yield* subs.listFor(a.id)).map((s) => [s.endpoint, s.p256dh]), [[ep(1), 'k2']]);
			// a shared browser signed in as someone else: the subscription moves
			yield* subs.save({ userId: b.id, endpoint: ep(1), p256dh: 'k', auth: 'a' });
			assert.lengthOf(yield* subs.listFor(a.id), 0);
			assert.lengthOf(yield* subs.listFor(b.id), 1);
			// a user cannot remove someone else's
			assert.isFalse(yield* subs.remove(a.id, ep(1)));
			assert.isTrue(yield* subs.remove(b.id, ep(1)));
			for (let i = 0; i < 12; i++) yield* subs.save({ userId: a.id, endpoint: ep(100 + i), p256dh: 'k', auth: 'a' });
			const kept = (yield* subs.listFor(a.id)).map((s) => s.endpoint);
			assert.lengthOf(kept, 10);
			assert.notInclude(kept, ep(100));
			assert.include(kept, ep(111));
		})
	);

	it.effect('sends the bell\'s words and link to each of the user\'s devices only', () =>
		Effect.gen(function* () {
			sent.length = 0;
			failWith = {};
			const users = yield* Users;
			const subs = yield* PushSubscriptions;
			const u = yield* users.ensure({ clerkUserId: 'push_u', role: 'player' });
			const other = yield* users.ensure({ clerkUserId: 'push_other', role: 'player' });
			yield* subs.save({ userId: u.id, endpoint: ep(201), p256dh: 'k', auth: 'a' });
			yield* subs.save({ userId: u.id, endpoint: ep(202), p256dh: 'k', auth: 'a' });
			yield* subs.save({ userId: other.id, endpoint: ep(203), p256dh: 'k', auth: 'a' });
			yield* (yield* WebPush).notify([note(u.id)]);
			assert.sameMembers(sent.map((s) => s.endpoint), [ep(201), ep(202)]);
			assert.deepStrictEqual(JSON.parse(sent[0]!.body), { title: 'Driver is ready', href: '/videos/v1', tag: 'video_ready' });
		})
	);

	it.effect('drops a subscription the push service says is gone, keeps one that failed otherwise, and never fails', () =>
		Effect.gen(function* () {
			sent.length = 0;
			const warn = console.warn;
			console.warn = () => {};
			const users = yield* Users;
			const subs = yield* PushSubscriptions;
			const u = yield* users.ensure({ clerkUserId: 'push_gone', role: 'player' });
			for (const n of [301, 302, 303]) yield* subs.save({ userId: u.id, endpoint: ep(n), p256dh: 'k', auth: 'a' });
			failWith = { [ep(301)]: { statusCode: 410 }, [ep(302)]: { statusCode: 500 } };
			yield* (yield* WebPush).notify([note(u.id)]);
			console.warn = warn;
			assert.sameMembers((yield* subs.listFor(u.id)).map((s) => s.endpoint), [ep(302), ep(303)]);
			assert.lengthOf(sent, 3); // the failure of one did not stop the others
			failWith = {};
		})
	);

	it('is off without keys, and a payload names the conversation for a message', () => {
		assert.isFalse(Effect.runSync(Effect.service(WebPush).pipe(Effect.map((w) => w.enabled), Effect.provide(WebPush.layerFromConfig({ publicKey: 'only-public' })), Effect.provide(Layer.succeed(PushSubscriptions, {} as never)))));
		assert.deepStrictEqual(pushPayloadFor(note('u', { type: 'message', payload: { conversationId: 'c9', senderName: 'Sam', count: 1 } })), {
			title: 'New message from Sam',
			href: '/messages/c9',
			tag: 'conversation-c9'
		});
	});
});
