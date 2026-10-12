import { Coaching, Users, Videos } from '@ttg/db';
import { TestDb } from '@ttg/db/testing';
import { Effect, Layer, ManagedRuntime } from 'effect';
import { afterAll, describe, expect, it } from 'vitest';
import { CoachAllowlist } from './auth';
import { addNote, assignPlayer, listNotes, listPlayers, unassignPlayer } from './players';
import { makeRunRoute } from './run-route';
import { fakeEvent } from './test-utils';

const Services = Layer.mergeAll(Users.layer, Videos.layer, Coaching.layer).pipe(Layer.provideMerge(TestDb));
const rt = ManagedRuntime.make(Layer.mergeAll(CoachAllowlist.layerFromCsv('coach_a,coach_b'), Services));
const run = makeRunRoute(rt);
afterAll(() => rt.dispose());

const call = async (effect: Effect.Effect<any, any, any>, user: string | null, params: Record<string, string> = {}, body?: unknown) => {
	const res = await run(fakeEvent({ userId: user, params, body }), effect as never);
	return { status: res.status, body: (await res.json()) as any };
};
const idOf = (clerk: string, role: 'player' | 'coach' = 'player') => rt.runPromise(Effect.flatMap(Users, (u) => u.ensure({ clerkUserId: clerk, role }))).then((u) => u.id);

describe('players API', () => {
	it('only coaches list players and manage relationships; a player gets 403 on every one', async () => {
		const pl = await idOf('pl_m1');
		const calls = await Promise.all([
			call(listPlayers, 'pl_m1'),
			call(assignPlayer, 'pl_m1', { id: pl }),
			call(unassignPlayer, 'pl_m1', { id: pl }),
			call(listNotes, 'pl_m1', { id: pl }),
			call(addNote, 'pl_m1', { id: pl }, { body: 'x' })
		]);
		for (const r of calls) expect(r.status).toBe(403);
		expect((await call(listPlayers, null)).status).toBe(401);
	});

	it('a coach assigns a player, sees them flagged, and can end it', async () => {
		const pl = await idOf('pl_m2');
		await idOf('coach_a', 'coach');
		expect((await call(assignPlayer, 'coach_a', { id: pl })).status).toBe(200);
		const mine = (await call(listPlayers, 'coach_a')).body.players.find((p: any) => p.id === pl);
		expect(mine.assigned).toBe(true);
		// another coach has no relationship
		expect((await call(listPlayers, 'coach_b')).body.players.find((p: any) => p.id === pl).assigned).toBe(false);
		expect((await call(unassignPlayer, 'coach_a', { id: pl })).status).toBe(200);
		expect((await call(unassignPlayer, 'coach_a', { id: pl })).status).toBe(404);
		expect((await call(assignPlayer, 'coach_a', { id: 'nope' })).status).toBe(404);
		expect((await call(assignPlayer, 'coach_a', { id: await idOf('coach_b', 'coach') })).status).toBe(404); // not a player
	});

	it('notes: only the assigned coach reads or writes them, and a player never sees them in any response', async () => {
		const pl = await idOf('pl_m3');
		await idOf('coach_a', 'coach');
		await idOf('coach_b', 'coach');
		expect((await call(addNote, 'coach_a', { id: pl }, { body: 'before' })).status).toBe(403); // not assigned yet
		await call(assignPlayer, 'coach_a', { id: pl });
		const added = await call(addNote, 'coach_a', { id: pl }, { body: '  Grip too strong  ' });
		expect(added.status).toBe(200);
		expect(added.body.body).toBe('Grip too strong');
		expect((await call(listNotes, 'coach_a', { id: pl })).body.notes.map((n: any) => n.body)).toEqual(['Grip too strong']);
		expect((await call(listNotes, 'coach_b', { id: pl })).status).toBe(403);
		expect((await call(listNotes, 'pl_m3', { id: pl })).status).toBe(403);
		for (const bad of [{ body: '' }, { body: 'x'.repeat(4001) }, {}]) expect((await call(addNote, 'coach_a', { id: pl }, bad)).status).toBe(422);
	});
});
