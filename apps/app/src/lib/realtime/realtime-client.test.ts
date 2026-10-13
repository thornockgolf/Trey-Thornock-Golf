import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openChannel, type ChannelStatus, type Socket, type SocketChannel } from './realtime-client';

const flush = async () => {
	for (let i = 0; i < 6; i++) await Promise.resolve();
};

const fakeSocket = () => {
	const handlers = new Map<string, (m: { payload: unknown }) => void>();
	let statusCb: (s: string) => void = () => {};
	const calls: string[] = [];
	const channel: SocketChannel = {
		on: (_t, f, cb) => (handlers.set(f.event, cb), channel),
		subscribe: (cb) => ((statusCb = cb), undefined)
	};
	const socket: Socket = {
		channel: (topic, opts) => (calls.push(`channel ${topic} private=${opts.config.private}`), channel),
		removeChannel: () => calls.push('remove'),
		setAuth: (t) => calls.push(`auth ${t}`),
		disconnect: () => calls.push('disconnect')
	};
	return { socket, handlers, calls, status: (s: string) => statusCb(s) };
};

const tokenRes = (over: Record<string, unknown> = {}, ttl = 300_000) =>
	new Response(JSON.stringify({ enabled: true, topic: 'conversation:c1', token: 'tok1', expiresAt: new Date(Date.now() + ttl).toISOString(), url: 'http://rt', anonKey: 'anon', ...over }));

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('openChannel', () => {
	it('asks for a token for the channel, joins privately, and passes broadcasts to the handlers', async () => {
		const f = fakeSocket();
		const fetchFn = vi.fn(async () => tokenRes());
		const got: unknown[] = [];
		const statuses: ChannelStatus[] = [];
		openChannel({ request: { channel: 'conversation', conversationId: 'c1' }, fetchFn, socket: async () => f.socket, events: { 'message.created': (p) => got.push(p) }, onStatus: (s) => statuses.push(s) });
		await flush();
		expect(JSON.parse((fetchFn.mock.calls[0] as unknown[])[1] ? ((fetchFn.mock.calls[0] as any)[1].body as string) : '{}')).toEqual({ channel: 'conversation', conversationId: 'c1' });
		expect(f.calls).toContain('channel conversation:c1 private=true');
		f.handlers.get('message.created')!({ payload: { id: 'm1' } });
		expect(got).toEqual([{ id: 'm1' }]);
		f.status('SUBSCRIBED');
		f.status('CHANNEL_ERROR');
		f.status('SUBSCRIBED');
		expect(statuses).toEqual(['live', 'down', 'live']);
	});

	it('reports "off" when the server has no Realtime, and "down" when the token request fails', async () => {
		const off: ChannelStatus[] = [];
		openChannel({ request: { channel: 'user' }, fetchFn: async () => new Response(JSON.stringify({ enabled: false })), events: {}, onStatus: (s) => off.push(s) });
		await flush();
		expect(off).toEqual(['off']);
		const down: ChannelStatus[] = [];
		openChannel({ request: { channel: 'user' }, fetchFn: async () => new Response('no', { status: 403 }), events: {}, onStatus: (s) => down.push(s) });
		await flush();
		expect(down).toEqual(['down']);
		const net: ChannelStatus[] = [];
		openChannel({ request: { channel: 'user' }, fetchFn: async () => { throw new Error('offline'); }, events: {}, onStatus: (s) => net.push(s) });
		await flush();
		expect(net).toEqual(['down']);
	});

	it('gets a new token before the old one expires and hands it to the socket', async () => {
		const f = fakeSocket();
		let n = 0;
		const fetchFn = vi.fn(async () => tokenRes({ token: `tok${++n}` }, 300_000));
		openChannel({ request: { channel: 'user' }, fetchFn, socket: async () => f.socket, events: {}, refreshBeforeMs: 60_000 });
		await flush();
		expect(fetchFn).toHaveBeenCalledTimes(1);
		await vi.advanceTimersByTimeAsync(239_000);
		expect(fetchFn).toHaveBeenCalledTimes(1);
		await vi.advanceTimersByTimeAsync(2_000);
		await flush();
		expect(fetchFn).toHaveBeenCalledTimes(2);
		expect(f.calls).toContain('auth tok2');
	});

	it('close() leaves the channel, disconnects, and stops refreshing', async () => {
		const f = fakeSocket();
		const fetchFn = vi.fn(async () => tokenRes());
		const h = openChannel({ request: { channel: 'user' }, fetchFn, socket: async () => f.socket, events: {} });
		await flush();
		h.close();
		expect(f.calls).toEqual(expect.arrayContaining(['remove', 'disconnect']));
		await vi.advanceTimersByTimeAsync(600_000);
		expect(fetchFn).toHaveBeenCalledTimes(1);
	});

	it('closing before the socket is ready never opens one', async () => {
		const f = fakeSocket();
		const h = openChannel({ request: { channel: 'user' }, fetchFn: async () => tokenRes(), socket: async () => f.socket, events: {} });
		h.close();
		await flush();
		expect(f.calls).not.toContain('channel conversation:c1 private=true');
	});
});
