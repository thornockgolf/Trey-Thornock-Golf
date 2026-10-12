import { assert, layer } from '@effect/vitest';
import { Effect, Layer } from 'effect';
import { Coaching } from './coaching';
import { Db } from './db';
import { TestDb } from './testing';
import { Users } from './users';
import { Videos } from './videos';

const Live = Layer.mergeAll(Users.layer, Videos.layer, Coaching.layer).pipe(Layer.provideMerge(TestDb));
const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

layer(Live, { timeout: 60_000 })('Coaching', (it) => {
	const setup = (tag: string) =>
		Effect.gen(function* () {
			const users = yield* Users;
			const coach = yield* users.ensure({ clerkUserId: `${tag}_coach`, role: 'coach' });
			const a = yield* users.ensure({ clerkUserId: `${tag}_a`, role: 'player' });
			const b = yield* users.ensure({ clerkUserId: `${tag}_b`, role: 'player' });
			return { coach, a, b, coaching: yield* Coaching, users };
		});

	it.effect('lists every player; only assigned ones are flagged, and they come first', () =>
		Effect.gen(function* () {
			const { coach, a, b, coaching } = yield* setup('c1');
			assert.strictEqual(yield* coaching.assign(coach.id, b.id), 'Assigned');
			const list = (yield* coaching.listPlayers(coach.id)).filter((p) => [a.id, b.id].includes(p.id));
			assert.deepStrictEqual(list.map((p) => [p.id === b.id ? 'b' : 'a', p.assigned]), [['b', true], ['a', false]]);
		})
	);

	it.effect('assign is repeatable, only works for players, and can be ended and resumed', () =>
		Effect.gen(function* () {
			const { coach, a, coaching } = yield* setup('c2');
			assert.strictEqual(yield* coaching.assign(coach.id, coach.id), 'NotAPlayer');
			assert.strictEqual(yield* coaching.assign(coach.id, ID(900)), 'NotAPlayer');
			assert.strictEqual(yield* coaching.assign(coach.id, a.id), 'Assigned');
			assert.strictEqual(yield* coaching.assign(coach.id, a.id), 'Assigned');
			assert.isTrue(yield* coaching.end(coach.id, a.id));
			assert.isFalse(yield* coaching.end(coach.id, a.id));
			const ended = (yield* coaching.listPlayers(coach.id)).find((p) => p.id === a.id)!;
			assert.isFalse(ended.assigned);
			yield* coaching.assign(coach.id, a.id);
			assert.isTrue((yield* coaching.listPlayers(coach.id)).find((p) => p.id === a.id)!.assigned);
		})
	);

	it.effect('notes need an active relationship, belong to that coach, and come back newest first', () =>
		Effect.gen(function* () {
			const { coach, a, coaching, users } = yield* setup('c3');
			const other = yield* users.ensure({ clerkUserId: 'c3_other_coach', role: 'coach' });
			assert.deepStrictEqual(yield* coaching.addNote(coach.id, a.id, 'x'), { _tag: 'NotPaired' });
			yield* coaching.assign(coach.id, a.id);
			yield* coaching.addNote(coach.id, a.id, 'first');
			yield* (yield* Db).query(`update coach_notes set created_at = now() - interval '1 hour'`);
			yield* coaching.addNote(coach.id, a.id, 'second');
			assert.deepStrictEqual((yield* coaching.listNotes(coach.id, a.id)).map((n) => n.body), ['second', 'first']);
			assert.deepStrictEqual(yield* coaching.listNotes(other.id, a.id), []);
			yield* coaching.end(coach.id, a.id);
			assert.deepStrictEqual(yield* coaching.addNote(coach.id, a.id, 'late'), { _tag: 'NotPaired' });
		})
	);

	it.effect('counts new ready swings and completed sessions for the dashboard', () =>
		Effect.gen(function* () {
			const { coach, a, coaching } = yield* setup('c4');
			const videos = yield* Videos;
			yield* videos.create({ id: ID(4001), ownerId: a.id, kind: 'swing', sourceKey: 'k1', sizeBytes: 1 });
			yield* videos.create({ id: ID(4002), ownerId: a.id, kind: 'swing', sourceKey: 'k2', sizeBytes: 1 });
			for (const id of [ID(4001)]) {
				yield* videos.markUploaded(id, 1);
				yield* videos.claimForProcessing(id);
				yield* videos.markReady(id, { processedKey: 'p', thumbnailKey: 't', spriteKey: 's', durationMs: 1000, fps: 30, width: 1, height: 1 });
			}
			const p = (yield* coaching.listPlayers(coach.id)).find((x) => x.id === a.id)!;
			assert.strictEqual(p.newVideos, 1); // the other is still pending
			assert.isNotNull(p.lastVideoAt);
			assert.strictEqual(p.upcomingSessions, 0);
			assert.isFalse(p.hasQuestionnaire);
		})
	);
});
