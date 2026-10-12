import { describe, expect, it } from 'vitest';
import { currentUser, requireRole } from './auth';
import { fakeEvent, testRunRoute } from './test-utils';

const run = testRunRoute('coach_1, coach_2');

describe('currentUser', () => {
	it('returns 401 without a session', async () => {
		const res = await run(fakeEvent({ userId: null }), currentUser);
		expect(res.status).toBe(401);
		expect(await res.json()).toEqual({ code: 'NotAuthenticated', message: 'Sign in required' });
	});

	it('defaults to player', async () => {
		const res = await run(fakeEvent({ userId: 'user_9' }), currentUser);
		expect(await res.json()).toEqual({ id: 'id_user_9', clerkUserId: 'user_9', role: 'player' });
	});

	it('resolves coach from the allowlist (trimmed, comma separated)', async () => {
		const res = await run(fakeEvent({ userId: 'coach_2' }), currentUser);
		expect(await res.json()).toEqual({ id: 'id_coach_2', clerkUserId: 'coach_2', role: 'coach' });
	});

	it('treats an empty allowlist as no coaches', async () => {
		const res = await testRunRoute('')(fakeEvent({ userId: 'coach_1' }), currentUser);
		expect((await res.json()).role).toBe('player');
	});
});

describe('requireRole', () => {
	it('lets a coach through', async () => {
		const res = await run(fakeEvent({ userId: 'coach_1' }), requireRole('coach'));
		expect(res.status).toBe(200);
	});

	it('returns 403 for a player and leaks nothing', async () => {
		const res = await run(fakeEvent({ userId: 'user_9' }), requireRole('coach'));
		expect(res.status).toBe(403);
		expect(await res.json()).toEqual({ code: 'Forbidden', message: 'Not allowed' });
	});

	it('returns 401 before 403 when signed out', async () => {
		const res = await run(fakeEvent({ userId: null }), requireRole('coach'));
		expect(res.status).toBe(401);
	});
});
