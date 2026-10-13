import type { NotificationDto, NotificationPageDto, UnreadDto } from '@ttg/shared';
import { openChannel, type ChannelHandle, type ChannelStatus } from './realtime-client';

/** Fallback poll when the socket is not live. */
export const UNREAD_POLL_MS = 30_000;

/** Fired on `window` when the user channel says a video changed (`video.ready` / `video.failed`). */
export const VIDEO_EVENT = 'ttg:video-event';

/**
 * Badge counts and the latest notifications for the signed-in user. Counts always come from
 * Postgres (`/api/unread`), so they are right after being offline; Realtime on `user:{id}` only
 * says "something changed, look again" quickly, and a slow poll covers a dead socket.
 */
class Unread {
	messages = $state(0);
	notifications = $state(0);
	recent = $state<NotificationDto[]>([]);
	status = $state<ChannelStatus>('connecting');
	/** True once the first answer from the server has arrived. */
	loaded = $state(false);
	#base = '/api';
	#handle: ChannelHandle | undefined;

	get live() {
		return this.status === 'live';
	}

	async refresh() {
		try {
			const [u, n] = await Promise.all([fetch(`${this.#base}/unread`), fetch(`${this.#base}/notifications`)]);
			if (u.ok) {
				const counts = (await u.json()) as UnreadDto;
				this.messages = counts.messages;
				this.notifications = counts.notifications;
			}
			if (n.ok) this.recent = [...((await n.json()) as NotificationPageDto).notifications];
			if (u.ok && n.ok) this.loaded = true;
		} catch {
			/* offline: keep what we have */
		}
	}

	/** Mark notifications read (all, or some) and update the counts from the answer. */
	async markRead(ids?: readonly string[]) {
		const body = ids ? { ids } : { all: true };
		const stamp = new Date().toISOString();
		this.recent = this.recent.map((n) => (!ids || ids.includes(n.id) ? { ...n, readAt: n.readAt ?? stamp } : n));
		try {
			const res = await fetch(`${this.#base}/notifications`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
			if (res.ok) this.notifications = ((await res.json()) as { unread: number }).unread;
		} catch {
			/* the next refresh corrects it */
		}
		await this.refresh();
	}

	/** Start for the signed-in browser session. Returns a cleanup function. */
	start(apiBase = '/api') {
		this.#base = apiBase;
		void this.refresh();
		this.#handle = openChannel({
			apiBase,
			request: { channel: 'user' },
			onStatus: (s) => {
				const wasDown = this.status === 'down';
				this.status = s;
				if (s === 'live' && wasDown) void this.refresh(); // catch up on what the socket missed
			},
			events: {
				'notification.created': () => void this.refresh(),
				'video.ready': (p) => window.dispatchEvent(new CustomEvent(VIDEO_EVENT, { detail: p })),
				'video.failed': (p) => window.dispatchEvent(new CustomEvent(VIDEO_EVENT, { detail: p }))
			}
		});
		const poll = setInterval(() => {
			if (document.visibilityState === 'visible' && !this.live) void this.refresh();
		}, UNREAD_POLL_MS);
		const onVisible = () => document.visibilityState === 'visible' && void this.refresh();
		document.addEventListener('visibilitychange', onVisible);
		addEventListener('online', onVisible);
		return () => {
			this.#handle?.close();
			clearInterval(poll);
			document.removeEventListener('visibilitychange', onVisible);
			removeEventListener('online', onVisible);
		};
	}
}

export const unread = new Unread();
