import { Users } from '@ttg/db';
import { TestDb } from '@ttg/db/testing';
import { Layer } from 'effect';
import { describe, expect, it } from 'vitest';
import { currentUser } from './auth';
import { fakeEvent, testRunRoute } from './test-utils';

// Integration: real Users + Db on a throwaway migrated database (needs `docker compose up -d db`).
const run = testRunRoute('coach_1', Users.layer.pipe(Layer.provide(TestDb)));

describe('currentUser with a real database', () => {
	it('creates the users row as a player on first sign-in and returns the same id after', async () => {
		const first = await (await run(fakeEvent({ userId: 'user_first' }), currentUser)).json();
		expect(first.role).toBe('player');
		expect(first.id).toMatch(/^[0-9a-f-]{36}$/);
		const second = await (await run(fakeEvent({ userId: 'user_first' }), currentUser)).json();
		expect(second.id).toBe(first.id);
	});

	it('stores coach for an allowlisted Clerk id', async () => {
		const me = await (await run(fakeEvent({ userId: 'coach_1' }), currentUser)).json();
		expect(me.role).toBe('coach');
	});
});
