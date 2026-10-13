/** What the service worker does with a push, kept free of worker globals so it can be tested. */

export interface ShownPush {
	readonly title: string;
	/** Absolute same-origin URL to open on tap. */
	readonly url: string;
	readonly tag: string;
}

/**
 * Read the server's push payload (`PushPayload` in packages/shared). Anything unreadable still shows a generic
 * notification: a push that shows nothing can make the browser revoke the permission. The link is resolved against
 * the app's own origin and dropped if it points anywhere else.
 */
export const parsePush = (raw: string | undefined, origin: string): ShownPush => {
	let data: { title?: unknown; href?: unknown; tag?: unknown } = {};
	try {
		data = raw ? (JSON.parse(raw) as typeof data) : {};
	} catch {
		data = {};
	}
	const title = typeof data.title === 'string' && data.title.trim() ? data.title.trim().slice(0, 140) : 'New notification';
	const tag = typeof data.tag === 'string' && data.tag ? data.tag.slice(0, 64) : 'ttg';
	const fallback = `${origin}/notifications`;
	let url = fallback;
	if (typeof data.href === 'string') {
		try {
			const u = new URL(data.href, origin);
			if (u.origin === origin) url = u.href;
		} catch {
			/* keep the fallback */
		}
	}
	return { title, url, tag };
};
