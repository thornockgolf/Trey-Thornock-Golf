import { Notifications } from '@ttg/db';
import { MarkReadRequest, type NotificationPageDto } from '@ttg/shared';
import { Effect } from 'effect';
import { currentUser } from './auth';
import { decodeBody } from './decode';
import { toNotificationDto } from './notify';

/** `GET /api/notifications`: the signed-in user's own, newest first, with the unread count. */
export const listNotifications = Effect.gen(function* () {
	const user = yield* currentUser;
	const n = yield* Notifications;
	const [list, unread] = yield* Effect.all([n.list(user.id), n.unreadCount(user.id)]);
	return { notifications: list.map(toNotificationDto), unread } satisfies NotificationPageDto;
});

/** `PATCH /api/notifications`: `{ ids }` or `{ all: true }`. Ids that are not the caller's are ignored. */
export const markNotificationsRead = Effect.gen(function* () {
	const user = yield* currentUser;
	const body = yield* decodeBody(MarkReadRequest);
	const n = yield* Notifications;
	const updated = 'all' in body ? yield* n.markAllRead(user.id) : yield* n.markRead(user.id, body.ids);
	return { updated, unread: yield* n.unreadCount(user.id) };
});

