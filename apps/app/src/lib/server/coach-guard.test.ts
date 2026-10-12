import { Users, DatabaseError } from '@ttg/db';
import { Effect, Layer } from 'effect';
import { describe, expect, it, vi } from 'vitest';
import { coachGuard, isCoachPath } from './coach-guard';
import { FakeUsers, fakeEvent, testRunRoute } from './test-utils';

const eventAt = (pathname: string, userId: string | null) => {
	const e = fakeEvent({ userId });
	(e as { url: URL }).url = new URL(`http://localhost${pathname}`);
	return e;
};
const ok = new Response('page');

describe('isCoachPath', () => {
	it.each(['/coach', '/coach/', '/coach/players/1'])('guards %s', (p) => expect(isCoachPath(p)).toBe(true));
	it.each(['/', '/coachx', '/coaching', '/api/coach', '/player/coach', '/sign-in'])('ignores %s', (p) =>
		expect(isCoachPath(p)).toBe(false)
	);
});

describe('coachGuard', () => {
	const guard = coachGuard(testRunRoute('coach_1'));

	it('passes non-coach paths through without checking anything', async () => {
		const resolve = vi.fn(async () => ok);
		const res = await guard({ event: eventAt('/', 'user_9'), resolve });
		expect(res).toBe(ok);
		expect(resolve).toHaveBeenCalledOnce();
	});

	it('lets a coach into /coach', async () => {
		const resolve = vi.fn(async () => ok);
		const res = await guard({ event: eventAt('/coach/players', 'coach_1'), resolve });
		expect(res).toBe(ok);
	});

	it('returns 403 for a player and never renders the page', async () => {
		const resolve = vi.fn(async () => ok);
		await expect(guard({ event: eventAt('/coach', 'user_9'), resolve })).rejects.toMatchObject({ status: 403 });
		expect(resolve).not.toHaveBeenCalled();
	});

	it('denies, not allows, when the role cannot be determined (database failure)', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const broken = Layer.succeed(
			Users,
			Users.of({
				ensure: () => Effect.fail(new DatabaseError({ message: 'Query failed' })),
				findByClerkId: () => Effect.fail(new DatabaseError({ message: 'Query failed' }))
			})
		);
		const g = coachGuard(testRunRoute('coach_1', broken));
		const resolve = vi.fn(async () => ok);
		await expect(g({ event: eventAt('/coach', 'coach_1'), resolve })).rejects.toMatchObject({ status: 500 });
		expect(resolve).not.toHaveBeenCalled();
		vi.restoreAllMocks();
	});

	it('uses the in-memory users by default (sanity)', () => {
		expect(FakeUsers).toBeDefined();
	});
});
