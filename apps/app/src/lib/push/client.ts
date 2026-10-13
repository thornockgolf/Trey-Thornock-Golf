import type { PushConfigDto } from '@ttg/shared';

/** Browser side of web push. Every call here runs from a user's tap (never on page load). */

export type PushState =
	| 'unsupported' // no service worker / Push API / Notification (older browsers; iOS outside an installed app)
	| 'off' // the server has no VAPID keys
	| 'blocked' // the user denied the permission in the browser
	| 'disabled' // available, not turned on for this device
	| 'enabled';

export const pushSupported = () =>
	typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

/** The VAPID public key as the bytes `pushManager.subscribe` wants. */
export const urlBase64ToBytes = (b64: string): Uint8Array<ArrayBuffer> => {
	const padded = (b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
	const raw = atob(padded);
	const out = new Uint8Array(new ArrayBuffer(raw.length));
	for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
	return out;
};

const json = async <T>(res: Response): Promise<T> => {
	if (!res.ok) throw new Error(`Request failed (${res.status})`);
	return (await res.json()) as T;
};

export const fetchPushConfig = async (): Promise<PushConfigDto> => json<PushConfigDto>(await fetch('/api/push'));

/** Where this device stands. Reads permission and the existing subscription; asks for nothing. */
export const pushState = async (config: PushConfigDto): Promise<PushState> => {
	if (!pushSupported()) return 'unsupported';
	if (!config.enabled) return 'off';
	if (Notification.permission === 'denied') return 'blocked';
	const reg = await navigator.serviceWorker.getRegistration();
	const sub = await reg?.pushManager.getSubscription();
	return sub && Notification.permission === 'granted' ? 'enabled' : 'disabled';
};

const post = async (path: string, body: unknown) =>
	json(await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }));

/** Ask for permission (the browser prompt), subscribe, and tell the server. Returns the new state. */
export const enablePush = async (config: PushConfigDto): Promise<PushState> => {
	if (!pushSupported() || !config.enabled || !config.publicKey) return pushState(config);
	const permission = await Notification.requestPermission();
	if (permission !== 'granted') return permission === 'denied' ? 'blocked' : 'disabled';
	const reg = await navigator.serviceWorker.ready;
	const sub =
		(await reg.pushManager.getSubscription()) ??
		(await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToBytes(config.publicKey) }));
	const { endpoint, keys } = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
	await post('/api/push/subscribe', { endpoint, keys });
	return 'enabled';
};

/** Unsubscribe this browser and tell the server to forget it. */
export const disablePush = async (config: PushConfigDto): Promise<PushState> => {
	const reg = await navigator.serviceWorker.getRegistration();
	const sub = await reg?.pushManager.getSubscription();
	if (sub) {
		await post('/api/push/unsubscribe', { endpoint: sub.endpoint }).catch(() => {});
		await sub.unsubscribe();
	}
	return pushState(config);
};
