import { Realtime, toNotificationDto, type Notification } from '@ttg/db';
import { userTopic } from '@ttg/shared';

export { toNotificationDto };
import { Effect } from 'effect';

/** Tell the user's open tabs about notifications that are already stored. Best effort. */
export const publishNotifications = (notifications: readonly Notification[]) =>
	Effect.gen(function* () {
		const realtime = yield* Realtime;
		yield* Effect.forEach(notifications, (n) => realtime.publish(userTopic(n.userId), 'notification.created', toNotificationDto(n)), { concurrency: 4, discard: true });
	});
