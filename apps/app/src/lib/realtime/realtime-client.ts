/**
 * The browser side of Supabase Realtime (spec 3.E.1). A page asks the app server for a short-lived
 * token for one channel, joins that private Broadcast channel with it, and asks again before the
 * token runs out. When the server says Realtime is not configured, or the socket is down, the
 * caller keeps working by polling: the status callback says which.
 */

export type ChannelStatus = 'connecting' | 'live' | 'down' | 'off';

export type TokenRequest = { channel: 'user' } | { channel: 'conversation'; conversationId: string };

export interface TokenResponse {
	enabled: boolean;
	topic?: string;
	token?: string;
	expiresAt?: string;
	url?: string;
	anonKey?: string;
}

/** The little of `RealtimeClient` that is used, so tests can stand in for the socket. */
export interface SocketChannel {
	on: (type: 'broadcast', filter: { event: string }, cb: (msg: { payload: unknown }) => void) => SocketChannel;
	subscribe: (cb: (status: string) => void) => unknown;
}
export interface Socket {
	channel: (topic: string, opts: { config: { private: boolean } }) => SocketChannel;
	removeChannel: (c: SocketChannel) => unknown;
	setAuth: (token?: string | null) => unknown;
	disconnect: () => unknown;
}
export type SocketFactory = (url: string, anonKey: string, accessToken: () => Promise<string | null>) => Promise<Socket>;

const realSocket: SocketFactory = async (url, anonKey, accessToken) => {
	const { RealtimeClient } = await import('@supabase/realtime-js');
	return new RealtimeClient(`${url.replace(/^http/, 'ws')}/realtime/v1`, { params: { apikey: anonKey }, accessToken }) as unknown as Socket;
};

export interface OpenChannelOptions {
	request: TokenRequest;
	/** Event name -> handler, for the channel's broadcasts. */
	events: Record<string, (payload: any) => void>;
	onStatus?: (status: ChannelStatus) => void;
	/** `/api` in the app. */
	apiBase?: string;
	fetchFn?: typeof fetch;
	socket?: SocketFactory;
	/** Refresh this long before the token expires. */
	refreshBeforeMs?: number;
	now?: () => number;
}

export interface ChannelHandle {
	close: () => void;
}

export const openChannel = (o: OpenChannelOptions): ChannelHandle => {
	const doFetch = o.fetchFn ?? fetch;
	const now = o.now ?? Date.now;
	const refreshBefore = o.refreshBeforeMs ?? 60_000;
	let closed = false;
	let socket: Socket | undefined;
	let channel: SocketChannel | undefined;
	let timer: ReturnType<typeof setTimeout> | undefined;
	let token: string | null = null;
	let status: ChannelStatus = 'connecting';
	const set = (s: ChannelStatus) => {
		if (closed || s === status) return;
		status = s;
		o.onStatus?.(s);
	};

	const mint = async (): Promise<TokenResponse | undefined> => {
		try {
			const res = await doFetch(`${o.apiBase ?? '/api'}/realtime/token`, {
				method: 'POST',
				headers: { 'content-type': 'application/json', accept: 'application/json' },
				body: JSON.stringify(o.request)
			});
			return res.ok ? ((await res.json()) as TokenResponse) : undefined;
		} catch {
			return undefined;
		}
	};

	const schedule = (expiresAt: string) => {
		if (closed) return;
		const wait = Math.max(5_000, new Date(expiresAt).getTime() - now() - refreshBefore);
		timer = setTimeout(async () => {
			const next = await mint();
			if (closed) return;
			if (next?.enabled && next.token && next.expiresAt) {
				token = next.token;
				await socket?.setAuth(token);
				schedule(next.expiresAt);
			} else {
				set('down'); // could not renew: the page polls until it is back
				timer = setTimeout(() => schedule(new Date(now() + refreshBefore + 10_000).toISOString()), 15_000);
			}
		}, wait);
	};

	void (async () => {
		const first = await mint();
		if (closed) return;
		if (!first) return set('down');
		if (!first.enabled || !first.token || !first.topic || !first.url || !first.anonKey || !first.expiresAt) return set('off');
		token = first.token;
		try {
			socket = await (o.socket ?? realSocket)(first.url, first.anonKey, async () => token);
			if (closed) {
				socket.disconnect();
				return;
			}
			channel = socket.channel(first.topic, { config: { private: true } });
			for (const [event, handler] of Object.entries(o.events)) channel.on('broadcast', { event }, (m) => handler(m.payload));
			channel.subscribe((s) => set(s === 'SUBSCRIBED' ? 'live' : 'down'));
			schedule(first.expiresAt);
		} catch {
			set('down');
		}
	})();

	return {
		close: () => {
			closed = true;
			if (timer) clearTimeout(timer);
			try {
				if (channel) socket?.removeChannel(channel);
				socket?.disconnect();
			} catch {
				/* closing is best effort */
			}
		}
	};
};
