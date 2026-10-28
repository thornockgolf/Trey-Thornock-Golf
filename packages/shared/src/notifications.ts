import { Schema } from 'effect';
import { Uuid } from './analyses';

/** In-app notifications (spec 3.E.1). Rows are written by the app and worker; the list is read from Postgres. */

export const NOTIFICATION_TYPES = [
	'message',
	'video_ready',
	'video_failed',
	'analysis_ready',
	'plan_assigned',
	'check_in_scheduled',
	'check_in_submitted',
	'assessment_result',
	'payment_issue',
	'coach_assigned',
	'new_player'
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export interface NotificationDto {
	readonly id: string;
	/** A known type, or a string from a newer server: render unknown ones generically. */
	readonly type: string;
	readonly payload: Readonly<Record<string, unknown>>;
	readonly readAt: string | null;
	readonly createdAt: string;
}

export interface NotificationPageDto {
	readonly notifications: readonly NotificationDto[];
	readonly unread: number;
}

/** `PATCH /api/notifications`: mark some, or all, as read. */
export const MarkReadRequest = Schema.Union([
	Schema.Struct({ ids: Schema.Array(Uuid).pipe(Schema.check(Schema.isMinLength(1), Schema.isMaxLength(100))) }),
	Schema.Struct({ all: Schema.Literal(true) })
]);
export type MarkReadRequest = typeof MarkReadRequest.Type;

/** Where tapping a notification goes, and the words for it. Pure so the bell and the list agree. */
export const describeNotification = (n: Pick<NotificationDto, 'type' | 'payload'>): { title: string; href: string | null } => {
	const p = n.payload as Record<string, unknown>;
	const str = (k: string) => (typeof p[k] === 'string' ? (p[k] as string) : null);
	switch (n.type) {
		case 'message': {
			const count = typeof p.count === 'number' ? p.count : 1;
			const who = str('senderName') ?? 'Your coach';
			return { title: count > 1 ? `${count} new messages from ${who}` : `New message from ${who}`, href: str('videoId') ? `/videos/${str('videoId')}` : str('conversationId') ? `/messages/${str('conversationId')}` : '/messages' };
		}
		case 'video_ready':
			return { title: `${str('title') ?? 'Your video'} is ready`, href: str('videoId') ? `/videos/${str('videoId')}` : '/videos' };
		case 'video_failed':
			return { title: `${str('title') ?? 'Your video'} could not be processed`, href: str('videoId') ? `/videos/${str('videoId')}` : '/videos' };
		case 'analysis_ready':
			return { title: `Your coach analyzed ${str('title') ?? 'a video'}`, href: str('videoId') ? `/videos/${str('videoId')}` : '/videos' };
		case 'plan_assigned':
			return { title: `New practice plan: ${str('planTitle') ?? 'see your plans'}`, href: '/plans' };
		case 'check_in_scheduled':
			return { title: 'A check-in is on your calendar', href: '/calendar' };
		case 'check_in_submitted':
			return { title: 'A player submitted a check-in', href: str('playerId') ? `/coach/players/${str('playerId')}` : '/coach' };
		case 'assessment_result':
			return { title: 'A new test result was recorded', href: '/calendar' };
		case 'payment_issue':
			return { title: str('message') ?? 'There is a problem with your payment', href: '/billing' };
		case 'coach_assigned':
			return { title: 'You now have a coach', href: '/messages' };
		case 'new_player':
			return { title: `${str('playerName') ?? 'A new player'} joined you`, href: str('playerId') ? `/coach/players/${str('playerId')}` : '/coach' };
		default:
			return { title: 'New notification', href: null };
	}
};
