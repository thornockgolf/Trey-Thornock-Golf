import { describe, expect, it } from 'vitest';
import { ApiError, apiClient } from './coach-client';

const fakeFetch = (res: Response, calls: { url: string; init?: RequestInit }[] = []) =>
	((url: string, init?: RequestInit) => (calls.push({ url, init }), Promise.resolve(res.clone()))) as unknown as typeof fetch;
const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

describe('apiClient', () => {
	it('uses the documented paths and methods', async () => {
		const calls: { url: string; init?: RequestInit }[] = [];
		const c = apiClient('/api', fakeFetch(ok({ drills: [], plans: [], players: [], notes: [] }), calls));
		await c.drills.list();
		await c.plans.list();
		await c.plans.update('p1', { title: 'x' });
		await c.plans.assign('p1', { playerId: 'u1', startsOn: '2026-10-12' });
		await c.players.list();
		await c.players.assign('u1');
		await c.players.unassign('u1');
		await c.players.delete('u1');
		await c.players.notes('u1');
		await c.players.addNote('u1', 'hi');
		expect(calls.map((x) => `${x.init?.method} ${x.url}`)).toEqual([
			'GET /api/drills',
			'GET /api/plans',
			'PATCH /api/plans/p1',
			'POST /api/plans/p1/assign',
			'GET /api/players',
			'POST /api/players/u1/assign',
			'POST /api/players/u1/unassign',
			'POST /api/players/u1/delete',
			'GET /api/players/u1/notes',
			'POST /api/players/u1/notes'
		]);
		expect(JSON.parse(calls[7]!.init!.body as string)).toEqual({ confirm: true });
		expect(JSON.parse(calls[9]!.init!.body as string)).toEqual({ body: 'hi' });
	});

	it('unwraps lists and turns an error body into an ApiError', async () => {
		expect(await apiClient('/api', fakeFetch(ok({ plans: [{ id: 'a' }] }))).plans.list()).toEqual([{ id: 'a' }]);
		const err = await apiClient('/api', fakeFetch(new Response(JSON.stringify({ code: 'ValidationError', message: 'Invalid request: check title' }), { status: 422 }))).plans
			.create({ title: '', structure: { v: 1, sessions: [] } as never })
			.catch((e) => e);
		expect(err).toBeInstanceOf(ApiError);
		expect(err.status).toBe(422);
		expect(err.message).toBe('Invalid request: check title');
	});
});
