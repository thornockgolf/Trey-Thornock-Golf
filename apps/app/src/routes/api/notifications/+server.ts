import type { RequestHandler } from './$types';
import { listNotifications, markNotificationsRead } from '#lib/server/notifications';
import { runRoute } from '#lib/server/runtime';

/** The signed-in user's own notifications: list and mark read. */
export const GET: RequestHandler = (event) => runRoute(event, listNotifications);
export const PATCH: RequestHandler = (event) => runRoute(event, markNotificationsRead);
