import { describe, expect, it } from 'vitest';
import { chatApi } from './chat-client';

const recorder = () => {
	const urls: string[] = [];
	const fetchFn = (async (url: string) => {
		urls.push(url);
		return new Response(JSON.stringify({ messages: [], hasMore: false }), { status: 200 });
	}) as unknown as typeof fetch;
	return { urls, fetchFn };
};

describe('chatApi scope', () => {
	it('asks for one video\'s thread, the general thread, or everything', async () => {
		const r = recorder();
		await chatApi('/api', 'c1', { videoId: 'v1' }, r.fetchFn).after(7);
		await chatApi('/api', 'c1', 'general', r.fetchFn).before(9);
		await chatApi('/api', 'c1', 'general', r.fetchFn).markRead();
		await chatApi('/api', 'c1', { videoId: 'v1' }, r.fetchFn).markRead();
		await chatApi('/api', 'c1', undefined, r.fetchFn).after(undefined);
		expect(r.urls).toEqual([
			'/api/conversations/c1/messages?after=7&videoId=v1',
			'/api/conversations/c1/messages?before=9&scope=general',
			'/api/conversations/c1/read?scope=general',
			'/api/conversations/c1/read?videoId=v1',
			'/api/conversations/c1/messages'
		]);
	});
});
