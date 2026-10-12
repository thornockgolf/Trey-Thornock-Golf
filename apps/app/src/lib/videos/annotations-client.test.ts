import { describe, expect, it } from 'vitest';
import { AnnotationApiError, annotationApi } from './annotations-client';

const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
const fakeFetch = (res: Response, calls: { url: string; init?: RequestInit }[] = []) =>
	((url: string, init?: RequestInit) => (calls.push({ url, init }), Promise.resolve(res.clone()))) as unknown as typeof fetch;

const arrow = { v: 1, type: 'arrow', color: '#D4A017', width: 0.005, a: { x: 0, y: 0 }, b: { x: 1, y: 1 } } as const;

describe('annotationApi', () => {
	it('lists from the video path', async () => {
		const calls: { url: string; init?: RequestInit }[] = [];
		const out = await annotationApi('/api', 'v1', fakeFetch(reply(200, { annotations: [{ id: 'a' }] }), calls)).list();
		expect(out).toEqual([{ id: 'a' }]);
		expect(calls[0]!.url).toBe('/api/videos/v1/annotations');
	});
	it('posts JSON and patches/deletes by id with the version', async () => {
		const calls: { url: string; init?: RequestInit }[] = [];
		const api = annotationApi('/api', 'v1', fakeFetch(reply(200, { id: 'a', ok: true }), calls));
		await api.create({ startMs: 1, endMs: 2, shape: arrow });
		await api.update('a', { version: 3, endMs: 9 });
		await api.remove('a', 4);
		expect(calls.map((c) => [c.init?.method, c.url])).toEqual([
			['POST', '/api/videos/v1/annotations'],
			['PATCH', '/api/videos/v1/annotations/a'],
			['DELETE', '/api/videos/v1/annotations/a?version=4']
		]);
		expect(JSON.parse(calls[0]!.init!.body as string)).toEqual({ startMs: 1, endMs: 2, shape: arrow });
	});
	it('turns a 409 into a conflict error with the server message', async () => {
		const api = annotationApi('/api', 'v1', fakeFetch(reply(409, { code: 'Conflict', message: 'Reload' })));
		const err = await api.update('a', { version: 1, endMs: 2 }).catch((e) => e);
		expect(err).toBeInstanceOf(AnnotationApiError);
		expect(err.isConflict).toBe(true);
		expect(err.message).toBe('Reload');
	});
	it('survives a non-JSON error body', async () => {
		const api = annotationApi('/api', 'v1', fakeFetch(new Response('<html>', { status: 502 })));
		const err = await api.list().catch((e) => e);
		expect(err.status).toBe(502);
	});
});
