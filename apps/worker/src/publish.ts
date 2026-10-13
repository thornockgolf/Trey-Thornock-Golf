import { Realtime, WebPush, toNotificationDto, type Notification } from '@ttg/db';
import { userTopic } from '@ttg/shared';
import { Effect, Option } from 'effect';

/**
 * After a job wrote a notification, tell the user's open tabs: the specific event (`video.ready`,
 * `video.failed`) and `notification.created` for the bell. Best effort and optional: without a
 * Realtime layer (tests, or no Supabase settings) this does nothing, and the pages poll anyway. The same notification
 * goes to the user's devices through web push when that is set up.
 */
export const publishJobNotification = (n: Notification | undefined, event: 'video.ready' | 'video.failed' | null, payload: Record<string, unknown> = {}) =>
	Effect.gen(function* () {
		if (!n) return;
		const rt = yield* Effect.serviceOption(Realtime);
		if (Option.isSome(rt)) {
			if (event) yield* rt.value.publish(userTopic(n.userId), event, { ...n.payload, ...payload });
			yield* rt.value.publish(userTopic(n.userId), 'notification.created', toNotificationDto(n));
		}
		const push = yield* Effect.serviceOption(WebPush);
		if (Option.isSome(push)) yield* push.value.notify([n]);
	});
