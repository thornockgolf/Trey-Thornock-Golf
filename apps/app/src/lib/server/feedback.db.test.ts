import { Feedback, Users } from '@ttg/db';
import { TestDb } from '@ttg/db/testing';
import { Effect, Layer, ManagedRuntime } from 'effect';
import { afterAll, describe, expect, it } from 'vitest';
import { CoachAllowlist } from './auth';
import { createFeedback, exportFeedback, getFeedback, listFeedback, updateFeedback } from './feedback';
import { makeRunRoute } from './run-route';
import { fakeEvent } from './test-utils';

// Integration: feedback tickets on a real database. Roles come from the allowlist ("fb_coach" is the coach).
const rt = ManagedRuntime.make(Layer.mergeAll(CoachAllowlist.layerFromCsv('fb_coach'), Users.layer, Feedback.layer).pipe(Layer.provideMerge(TestDb)));
const run = makeRunRoute(rt);
afterAll(() => rt.dispose());

const call = async (effect: Effect.Effect<any, any, any>, user: string | null, o: { params?: Record<string, string>; body?: unknown; query?: string } = {}) => {
	const res = await run(fakeEvent({ userId: user, ...o }), effect as never);
	const text = await res.text();
	return { status: res.status, headers: res.headers, text, body: res.headers.get('content-type')?.includes('json') ? JSON.parse(text) : null };
};
const ticket = { title: 'Move the button', body: 'It covers the chat input.', type: 'change', pagePath: '/messages', viewport: '390x844', userAgent: 'UA' };
const file = async (user: string, over: object = {}) => (await call(createFeedback, user, { body: { ...ticket, ...over } })).body;

describe('feedback tickets', () => {
	it('any signed-in user files a ticket; the role comes from the session; anonymous is 401; bad input is 422', async () => {
		const p = await call(createFeedback, 'fb_p1', { body: { ...ticket, authorRole: 'coach' } });
		expect(p.status).toBe(200);
		expect(p.body).toMatchObject({ authorRole: 'player', status: 'open', priority: 'normal', pagePath: '/messages' });
		const c = await call(createFeedback, 'fb_coach', { body: { ...ticket, priority: 'high' } });
		expect(c.body).toMatchObject({ authorRole: 'coach', priority: 'high' });
		expect((await call(createFeedback, null, { body: ticket })).status).toBe(401);
		expect((await call(createFeedback, 'fb_p1', { body: { ...ticket, title: '' } })).status).toBe(422);
		expect((await call(createFeedback, 'fb_p1', { body: { ...ticket, title: 'x'.repeat(121) } })).status).toBe(422);
		expect((await call(createFeedback, 'fb_p1', { body: { ...ticket, body: 'x'.repeat(4001) } })).status).toBe(422);
		expect((await call(createFeedback, 'fb_p1', { body: { ...ticket, type: 'rant' } })).status).toBe(422);
	});

	it('players list and read only their own tickets; a coach sees all; filters apply', async () => {
		const a = await file('fb_p2', { title: 'A bug', type: 'bug' });
		const b = await file('fb_p3', { title: 'B idea', type: 'idea' });
		const own = (await call(listFeedback, 'fb_p2')).body.tickets;
		expect(own.map((t: any) => t.id)).toEqual([a.id]);
		expect((await call(getFeedback, 'fb_p2', { params: { id: a.id } })).status).toBe(200);
		expect((await call(getFeedback, 'fb_p2', { params: { id: b.id } })).status).toBe(404);
		expect((await call(getFeedback, 'fb_p2', { params: { id: 'nope' } })).status).toBe(404);
		expect((await call(listFeedback, null)).status).toBe(401);
		const all = (await call(listFeedback, 'fb_coach')).body.tickets.map((t: any) => t.id);
		expect(all).toEqual(expect.arrayContaining([a.id, b.id]));
		const ideas = (await call(listFeedback, 'fb_coach', { query: '?type=idea' })).body.tickets;
		expect(ideas.every((t: any) => t.type === 'idea')).toBe(true);
		expect(ideas.map((t: any) => t.id)).toContain(b.id);
		expect((await call(listFeedback, 'fb_coach', { query: '?status=done' })).body.tickets.map((t: any) => t.id)).not.toContain(a.id);
		expect((await call(getFeedback, 'fb_coach', { params: { id: b.id } })).status).toBe(200);
	});

	it('the author edits while open; others cannot; only a coach changes status or notes; edits stop once it is not open', async () => {
		const t = await file('fb_p4');
		const edit = await call(updateFeedback, 'fb_p4', { params: { id: t.id }, body: { title: 'Better title', body: 'More detail' } });
		expect(edit.body).toMatchObject({ title: 'Better title', body: 'More detail' });
		expect((await call(updateFeedback, 'fb_p5', { params: { id: t.id }, body: { title: 'Mine now' } })).status).toBe(404);
		expect((await call(updateFeedback, 'fb_p4', { params: { id: t.id }, body: { status: 'done' } })).status).toBe(403);
		expect((await call(updateFeedback, 'fb_p4', { params: { id: t.id }, body: { resolutionNotes: 'x' } })).status).toBe(403);
		expect((await call(updateFeedback, 'fb_coach', { params: { id: t.id }, body: { title: 'Coach edits player text' } })).status).toBe(403);
		expect((await call(updateFeedback, 'fb_p4', { params: { id: t.id }, body: { title: '' } })).status).toBe(422);
		expect((await call(updateFeedback, null, { params: { id: t.id }, body: {} })).status).toBe(401);

		const review = await call(updateFeedback, 'fb_coach', { params: { id: t.id }, body: { status: 'in_progress', resolutionNotes: 'On it' } });
		expect(review.body).toMatchObject({ status: 'in_progress', resolutionNotes: 'On it' });
		const locked = await call(updateFeedback, 'fb_p4', { params: { id: t.id }, body: { title: 'Too late' } });
		expect(locked.status).toBe(409);
		// the player still sees the coach's status and notes
		expect((await call(getFeedback, 'fb_p4', { params: { id: t.id } })).body).toMatchObject({ status: 'in_progress', resolutionNotes: 'On it' });
		// a coach can reopen, and then the author can edit again
		await call(updateFeedback, 'fb_coach', { params: { id: t.id }, body: { status: 'open' } });
		expect((await call(updateFeedback, 'fb_p4', { params: { id: t.id }, body: { title: 'Again' } })).status).toBe(200);
	});

	it('the coach edits their own ticket while open', async () => {
		const t = await file('fb_coach', { title: 'Mine' });
		expect((await call(updateFeedback, 'fb_coach', { params: { id: t.id }, body: { title: 'Still mine', priority: 'low' } })).body).toMatchObject({ title: 'Still mine', priority: 'low' });
	});

	it('exports Markdown for the coach only, open by default, filterable by status', async () => {
		const open = await file('fb_p6', { title: 'Export open' });
		const done = await file('fb_p6', { title: 'Export done' });
		await call(updateFeedback, 'fb_coach', { params: { id: done.id }, body: { status: 'done', resolutionNotes: 'shipped' } });
		expect((await call(exportFeedback, 'fb_p6')).status).toBe(403);
		expect((await call(exportFeedback, null)).status).toBe(401);
		const def = await call(exportFeedback, 'fb_coach');
		expect(def.status).toBe(200);
		expect(def.headers.get('content-type')).toContain('text/markdown');
		expect(def.text).toContain(`FB-${open.id.slice(0, 8)}: Export open`);
		expect(def.text).not.toContain('Export done');
		const doneMd = await call(exportFeedback, 'fb_coach', { query: '?status=done' });
		expect(doneMd.text).toContain('Export done');
		expect(doneMd.text).toContain('shipped');
		expect((await call(exportFeedback, 'fb_coach', { query: '?status=all' })).text).toContain('Export open');
	});
});
