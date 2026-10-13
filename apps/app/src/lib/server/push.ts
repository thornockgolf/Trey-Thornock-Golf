import { PushSubscriptions, WebPush } from '@ttg/db';
import { PushSubscribeRequest, PushUnsubscribeRequest, isAllowedPushEndpoint, type PushConfigDto } from '@ttg/shared';
import { Effect } from 'effect';
import { currentUser } from './auth';
import { decodeBody } from './decode';
import { Conflict, ValidationError } from './errors';

/** `GET /api/push`: whether browser notifications are set up on this server, and the key a browser subscribes with. */
export const getPushConfig = Effect.gen(function* () {
	yield* currentUser;
	const push = yield* WebPush;
	return { enabled: push.enabled, publicKey: push.publicKey } satisfies PushConfigDto;
});

/**
 * `POST /api/push/subscribe`: remember this browser for the signed-in user. The endpoint must be a known push
 * service over https, because the server later posts to it. The user is always the session's, never the body's.
 */
export const subscribePush = Effect.gen(function* () {
	const user = yield* currentUser;
	const push = yield* WebPush;
	if (!push.enabled) return yield* new Conflict({ message: 'Browser notifications are not set up on this server' });
	const body = yield* decodeBody(PushSubscribeRequest);
	if (!isAllowedPushEndpoint(body.endpoint)) return yield* new ValidationError({ message: 'Invalid request: check endpoint' });
	yield* (yield* PushSubscriptions).save({ userId: user.id, endpoint: body.endpoint, p256dh: body.keys.p256dh, auth: body.keys.auth });
	return { subscribed: true };
});

/** `POST /api/push/unsubscribe`: forget this browser. Only the caller's own subscription can be removed. */
export const unsubscribePush = Effect.gen(function* () {
	const user = yield* currentUser;
	const body = yield* decodeBody(PushUnsubscribeRequest);
	const removed = yield* (yield* PushSubscriptions).remove(user.id, body.endpoint);
	return { removed };
});
