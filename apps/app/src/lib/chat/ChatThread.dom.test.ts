import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import type { ConversationDto, MessageDto } from '@ttg/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ChatThread from './ChatThread.svelte';

const ME = 'coach';
const THEM = 'player';
const conversation: ConversationDto = {
	id: 'c1',
	other: { id: THEM, displayName: 'Sam Rivera', email: null, role: 'player' },
	lastMessage: null,
	unread: 0,
	videoUnread: 0,
	videoUnreadVideoId: null,
	updatedAt: '2026-11-02T10:00:00Z'
};
const msg = (seq: number, senderId: string, over: Partial<MessageDto> = {}): W => ({
	id: `m${seq}`, seq, conversationId: 'c1', senderId, body: `body ${seq}`, videoId: null, videoMs: null, createdAt: '2026-11-02T10:00:00Z', readAt: null, ...over
});

/** A stand-in for the app API with the real read rules (range, own messages never marked). */
type W = { -readonly [K in keyof MessageDto]: MessageDto[K] };
const fakeApi = (server: W[]) => {
	const calls: { method: string; url: string; body?: any }[] = [];
	let lastReader = THEM;
	const fn = vi.fn(async (input: string, init?: RequestInit) => {
		const url = new URL(input, 'http://x');
		const method = init?.method ?? 'GET';
		const body = init?.body ? JSON.parse(String(init.body)) : undefined;
		calls.push({ method, url: `${url.pathname}${url.search}`, body });
		const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status });
		if (url.pathname.endsWith('/realtime/token')) return json({ enabled: false });
		if (url.pathname.endsWith('/unread')) return json({ messages: 0, notifications: 0 });
		if (url.pathname.endsWith('/notifications')) return json({ notifications: [], unread: 0 });
		if (url.pathname.endsWith('/receipts')) {
			const from = Number(url.searchParams.get('from') ?? 0);
			return json({ receipts: server.filter((m) => m.senderId === ME && m.readAt && m.seq >= from).map((m) => ({ id: m.id, seq: m.seq, readAt: m.readAt })) });
		}
		if (url.pathname.endsWith('/read') && method === 'POST') {
			const from = url.searchParams.has('from') ? Number(url.searchParams.get('from')) : 0;
			const upTo = url.searchParams.has('upTo') ? Number(url.searchParams.get('upTo')) : Infinity;
			for (const m of server) if (m.senderId !== ME && !m.readAt && m.seq >= from && m.seq <= upTo) m.readAt = '2026-11-02T10:30:00Z';
			return json({ unread: { messages: 0, notifications: 0 } });
		}
		if (url.pathname.endsWith('/messages') && method === 'GET') {
			const after = url.searchParams.has('after') ? Number(url.searchParams.get('after')) : 0;
			return json({ conversation, messages: server.filter((m) => m.seq > after), hasMore: false });
		}
		if (url.pathname.endsWith('/messages') && method === 'POST') {
			const m = msg(Math.max(0, ...server.map((x) => x.seq)) + 1, ME, { body: body.body });
			server.push(m);
			return json(m);
		}
		return json({}, 404);
	});
	return { fn, calls, lastReader: () => lastReader, reads: () => calls.filter((c) => c.method === 'POST' && c.url.includes('/read')).map((c) => c.url) };
};

const setVisibility = (v: 'visible' | 'hidden') => Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => v });

beforeEach(() => setVisibility('visible'));
afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	setVisibility('visible');
});

const mount = (server: W[], over: Record<string, unknown> = {}, me = ME, initial?: MessageDto[]) => {
	const api = fakeApi(server);
	vi.stubGlobal('fetch', api.fn);
	render(ChatThread, {
		conversation,
		messages: initial ?? server.map((m) => ({ ...m })),
		hasMore: false,
		me,
		compose: { allowed: true, reason: null },
		apiBase: '/api',
		backHref: null,
		pollMs: 25,
		...over
	});
	return api;
};
const receipts = () => [...document.querySelectorAll('[data-receipt]')].map((e) => e.textContent?.trim());
const bubbles = () => [...document.querySelectorAll('[data-message]')].map((e) => e.getAttribute('data-read'));

describe('ChatThread read receipts', () => {
	it('shows Seen with a time on read messages and Delivered on the rest, per run of messages', () => {
		const server = [
			msg(1, ME, { readAt: '2026-11-02T10:05:00Z' }),
			msg(2, THEM),
			msg(3, ME, { readAt: '2026-11-02T10:06:00Z' }),
			msg(4, ME),
			msg(5, ME)
		];
		mount(server, {}, ME);
		// every bubble carries its own state; the text is on the last of a run and where seen/delivered changes
		expect(bubbles()).toEqual(['seen', null, 'seen', 'delivered', 'delivered']);
		expect(receipts()).toEqual([expect.stringMatching(/^Seen /), expect.stringMatching(/^Seen /), 'Delivered']);
	});

	it('turns Delivered into Seen on its own when the other side reads (poll fallback), without a reload', async () => {
		const server = [msg(1, ME), msg(2, ME)];
		mount(server, {}, ME);
		expect(receipts()).toEqual(['Delivered']);
		for (const m of server) m.readAt = '2026-11-02T10:10:00Z'; // the player opens the thread elsewhere
		await waitFor(() => expect(receipts()).toEqual([expect.stringMatching(/^Seen /)]));
		expect(bubbles()).toEqual(['seen', 'seen']);
	});

	it('marks the other side\'s loaded messages read on open, with the range, and once more for a late arrival only', async () => {
		const server = [msg(10, THEM), msg(11, THEM), msg(12, ME)];
		const api = mount(server, {}, ME);
		await waitFor(() => expect(api.reads()).toEqual(['/api/conversations/c1/read?scope=general&from=10&upTo=11']));
		// a new message from the player arrives while the thread is open: its seq is read on its own, not before
		server.push(msg(13, THEM));
		await waitFor(() => expect(api.reads().at(-1)).toBe('/api/conversations/c1/read?scope=general&from=10&upTo=13'));
		expect(api.reads()).toHaveLength(2);
		expect(server.filter((m) => m.senderId === THEM).every((m) => m.readAt)).toBe(true);
	});

	it('does not mark anything while the tab is hidden, and marks what is loaded when it comes back', async () => {
		setVisibility('hidden');
		const server = [msg(1, THEM), msg(2, THEM)];
		const api = mount(server, {}, ME);
		await new Promise((r) => setTimeout(r, 120));
		expect(api.reads()).toEqual([]);
		expect(server.some((m) => m.readAt)).toBe(false);
		// a message arriving while hidden stays unread too
		server.push(msg(3, THEM));
		await new Promise((r) => setTimeout(r, 120));
		expect(api.reads()).toEqual([]);
		setVisibility('visible');
		document.dispatchEvent(new Event('visibilitychange'));
		await waitFor(() => expect(api.reads().at(-1)).toBe('/api/conversations/c1/read?scope=general&from=1&upTo=3'));
		expect(server.every((m) => m.readAt)).toBe(true);
	});

	it('never marks messages older than the page it loaded (earlier messages not paged in stay unread)', async () => {
		const server = [msg(1, THEM), msg(2, THEM), msg(51, THEM), msg(52, THEM)];
		const api = mount(server, { hasMore: true }, ME, server.slice(2).map((m) => ({ ...m })));
		await waitFor(() => expect(api.reads()).toEqual(['/api/conversations/c1/read?scope=general&from=51&upTo=52']));
		expect(server.map((m) => !!m.readAt)).toEqual([false, false, true, true]);
	});

	it('sends with the range that was on screen, so a message that arrived while typing stays unread', async () => {
		const server = [msg(1, THEM)];
		const api = mount(server, {}, ME);
		await waitFor(() => expect(api.reads()).toHaveLength(1));
		const box = screen.getByRole('textbox');
		await fireEvent.input(box, { target: { value: 'hello' } });
		server.push(msg(2, THEM)); // not on screen yet (no poll has fetched it)
		await fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
		await waitFor(() => expect(api.calls.some((c) => c.method === 'POST' && c.url.endsWith('/messages'))).toBe(true));
		const post = api.calls.find((c) => c.method === 'POST' && c.url.endsWith('/messages'))!;
		expect(post.body).toMatchObject({ body: 'hello', seenSeq: 1, seenFromSeq: 1 });
	});
});
