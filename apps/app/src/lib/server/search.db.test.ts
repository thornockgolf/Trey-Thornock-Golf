import { Chat, Coaching, Notifications, Search, Users } from '@ttg/db';
import { TestDb } from '@ttg/db/testing';
import { Effect, Layer, ManagedRuntime } from 'effect';
import { afterAll, describe, expect, it } from 'vitest';
import { CoachAllowlist } from './auth';
import { makeRunRoute } from './run-route';
import { searchAll } from './search';
import { fakeEvent } from './test-utils';

const Services = Layer.mergeAll(Users.layer, Coaching.layer, Chat.layer, Notifications.layer, Search.layer).pipe(Layer.provideMerge(TestDb));
const rt = ManagedRuntime.make(Layer.mergeAll(CoachAllowlist.layerFromCsv('coach_s'), Services));
const run = makeRunRoute(rt);
afterAll(() => rt.dispose());

const call = async (user: string | null, query: string) => {
	const res = await run(fakeEvent({ userId: user, query }), searchAll as never);
	return { status: res.status, body: (await res.json()) as any };
};

describe('GET /api/search', () => {
	it('is coach only: 401 anonymous, 403 for players, even for text only a coach could see', async () => {
		const coach = await rt.runPromise(Effect.flatMap(Users, (u) => u.ensure({ clerkUserId: 'coach_s', role: 'coach' })));
		const player = await rt.runPromise(Effect.flatMap(Users, (u) => u.ensure({ clerkUserId: 'pl_s', role: 'player' })));
		await rt.runPromise(Effect.flatMap(Coaching, (c) => c.assign(coach.id, player.id)));
		await rt.runPromise(Effect.flatMap(Coaching, (c) => c.addNote(coach.id, player.id, 'Private: aggressive kumquat pressure')));
		expect((await call(null, '?q=kumquat')).status).toBe(401);
		const asPlayer = await call('pl_s', '?q=kumquat');
		expect(asPlayer.status).toBe(403);
		expect(JSON.stringify(asPlayer.body)).not.toContain('kumquat');
		const asCoach = await call('coach_s', '?q=kumquatt');
		expect(asCoach.status).toBe(200);
		expect(asCoach.body.categories.map((c: any) => c.kind)).toEqual(['note']);
		expect(asCoach.body.categories[0].label).toBe('Private notes');
		expect(asCoach.body.categories[0].results[0].href).toBe(`/coach/players/${player.id}`);
	});

	it('rejects a missing, too short, or too long query with a 422', async () => {
		await rt.runPromise(Effect.flatMap(Users, (u) => u.ensure({ clerkUserId: 'coach_s', role: 'coach' })));
		for (const q of ['', '?q=', '?q=a', '?q=%20%20', `?q=${'x'.repeat(81)}`]) expect((await call('coach_s', q)).status).toBe(422);
	});

	it('returns an empty category list when nothing matches', async () => {
		const res = await call('coach_s', '?q=nothingmatches');
		expect(res.status).toBe(200);
		expect(res.body).toEqual({ q: 'nothingmatches', categories: [] });
	});
});
