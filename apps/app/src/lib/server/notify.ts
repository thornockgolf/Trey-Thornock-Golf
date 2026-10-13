import { Realtime, WebPush, toNotificationDto, type Notification } from '@ttg/db';
import { userTopic } from '@ttg/shared';
import { Effect, Option } from 'effect';

export { toNotificationDto };

/**
 * Tell the user about notifications that are already stored: open tabs through Realtime, and their devices through
 * web push when it is set up. Best effort; neither can fail the request.
 */
export const publishNotifications = (notifications: readonly Notification[]) =>
	Effect.gen(function* () {
		const realtime = yield* Realtime;
		yield* Effect.forEach(notifications, (n) => realtime.publish(userTopic(n.userId), 'notification.created', toNotificationDto(n)), { concurrency: 4, discard: true });
		// Optional: tests and servers without a WebPush layer skip it. Detached, so a slow push service never delays the response.
		const push = yield* Effect.serviceOption(WebPush);
		if (Option.isSome(push)) yield* Effect.forkDetach(push.value.notify(notifications));
	});
