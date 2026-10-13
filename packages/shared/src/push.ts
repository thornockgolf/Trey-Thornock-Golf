import { Schema } from 'effect';

/** Web push (spec 3.E, Could-Have). Optional: off unless the server has VAPID keys. */

/** What a service worker shows for one push. Kept small: push payloads are limited to about 4 KB. */
export interface PushPayload {
	readonly title: string;
	/** Same-origin path to open on tap. */
	readonly href: string | null;
	/** Same tag replaces the earlier notification on the device (one per conversation, for example). */
	readonly tag: string;
}

export interface PushConfigDto {
	readonly enabled: boolean;
	/** The VAPID public key (base64url), for `pushManager.subscribe`; null when push is off. */
	readonly publicKey: string | null;
}

/** A device may keep at most this many subscriptions; the oldest are dropped. */
export const MAX_PUSH_SUBSCRIPTIONS_PER_USER = 10;

const B64URL = /^[A-Za-z0-9_-]+$/;
const b64url = (min: number, max: number) => Schema.String.pipe(Schema.check(Schema.isPattern(B64URL), Schema.isMinLength(min), Schema.isMaxLength(max)));

export const PushSubscribeRequest = Schema.Struct({
	endpoint: Schema.String.pipe(Schema.check(Schema.isMaxLength(1000))),
	keys: Schema.Struct({
		/** P-256 public key: 65 bytes, 87 characters. */
		p256dh: b64url(80, 100),
		/** 16 random bytes: 22 characters. */
		auth: b64url(20, 30)
	})
});
export type PushSubscribeRequest = typeof PushSubscribeRequest.Type;

export const PushUnsubscribeRequest = Schema.Struct({ endpoint: Schema.String.pipe(Schema.check(Schema.isMaxLength(1000))) });
export type PushUnsubscribeRequest = typeof PushUnsubscribeRequest.Type;

/** Hosts of the push services browsers use. The server POSTs to the endpoint a client names, so anything else is refused (no SSRF). */
const PUSH_HOST_SUFFIXES = ['fcm.googleapis.com', 'push.services.mozilla.com', 'push.apple.com', 'notify.windows.com'] as const;

export const isAllowedPushEndpoint = (endpoint: string): boolean => {
	let url: URL;
	try {
		url = new URL(endpoint);
	} catch {
		return false;
	}
	if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) return false;
	return PUSH_HOST_SUFFIXES.some((s) => url.hostname === s || url.hostname.endsWith(`.${s}`));
};
