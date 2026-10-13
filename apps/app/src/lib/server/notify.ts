import { Realtime, type Notification } from '@ttg/db';
import { userTopic, type NotificationDto } from '@ttg/shared';
import { Effect } from 'effect';

export const toNotificationDto = (n: Notification): NotificationDto => ({
	id: n.id,
	type: n.type,
	payload: n.payload,
	readAt: n.readAt?.toISOString() ?? null,
	createdAt: n.createdAt.toISOString()
});

/** Tell the user's open tabs about notifications that are already stored. Best effort. */
export const publishNotifications = (notifications: readonly Notification[]) =>
	Effect.gen(function* () {
		const realtime = yield* Realtime;
		yield* Effect.forEach(notifications, (n) => realtime.publish(userTopic(n.userId), 'notification.created', toNotificationDto(n)), { concurrency: 4, discard: true });
	});
