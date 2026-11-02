import { assert, layer } from '@effect/vitest';
import { Effect, Layer } from 'effect';
import { Chat } from './chat';
import { Coaching } from './coaching';
import { Db } from './db';
import { Notifications } from './notifications';
import { Search } from './search';
import { TestDb } from './testing';
import { Users } from './users';

const Live = Layer.mergeAll(Users.layer, Coaching.layer, Chat.layer, Notifications.layer, Search.layer).pipe(Layer.provideMerge(TestDb));

layer(Live, { timeout: 60_000 })('Search', (it) => {
	const world = (tag: string) =>
		Effect.gen(function* () {
			const users = yield* Users;
			const db = yield* Db;
			const coach = yield* users.ensure({ clerkUserId: `${tag}_c`, role: 'coach' });
			const player = yield* users.ensure({ clerkUserId: `${tag}_p`, role: 'player' });
			yield* users.syncProfile(player.id, { displayName: `${tag} Jonathan Rivera`, email: `${tag}.jon@example.com` });
			yield* (yield* Coaching).assign(coach.id, player.id);
			const conv = yield* (yield* Chat).ensure(coach.id, player.id);
			return { coach, player, conv, db, search: yield* Search, chat: yield* Chat };
		});
	const kinds = (groups: readonly { kind: string }[]) => groups.map((g) => g.kind);

	it.effect('finds players by name and email, with typos', () =>
		Effect.gen(function* () {
			const { coach, player, search } = yield* world('s1');
			for (const q of ['rivera', 'RIVERA', 'jonathon rivera', 'riviera', 's1.jon@']) {
				const groups = yield* search.run(coach.id, q);
				const players = groups.find((g) => g.kind === 'player');
				assert.isTrue(players?.results.some((r) => r.id === player.id), `query ${q}`);
				assert.strictEqual(players?.results.find((r) => r.id === player.id)?.href, `/coach/players/${player.id}`);
			}
			assert.deepStrictEqual(kinds(yield* search.run(coach.id, 'zzqxv')), []);
		})
	);

	it.effect('treats % and _ as literals', () =>
		Effect.gen(function* () {
			const { coach, search } = yield* world('s2');
			assert.deepStrictEqual(kinds(yield* search.run(coach.id, '%%')), []);
			assert.deepStrictEqual(kinds(yield* search.run(coach.id, '_ _')), []);
		})
	);

	it.effect('finds videos of coached players and the reference library, not other players videos', () =>
		Effect.gen(function* () {
			const { coach, player, db, search } = yield* world('s3');
			const users = yield* Users;
			const stranger = yield* users.ensure({ clerkUserId: 's3_x', role: 'player' });
			yield* db.query(`insert into videos (owner_id, kind, status, title) values ($1, 'swing', 'ready', 'Driver slice at the range')`, [player.id]);
			yield* db.query(`insert into videos (owner_id, kind, status, title) values ($1, 'swing', 'ready', 'Driver slice, uncoached player')`, [stranger.id]);
			yield* db.query(`insert into videos (owner_id, kind, status, title) values ($1, 'reference', 'ready', 'Tour pro driver tempo')`, [coach.id]);
			yield* db.query(`insert into videos (owner_id, kind, status, title) values ($1, 'swing', 'pending', 'Driver pending upload')`, [player.id]);
			const groups = yield* search.run(coach.id, 'driver slcie');
			const swing = groups.find((g) => g.kind === 'video');
			assert.deepStrictEqual(swing?.results.map((r) => r.title), ['Driver slice at the range']);
			const ref = (yield* search.run(coach.id, 'tempo')).find((g) => g.kind === 'reference');
			assert.deepStrictEqual(ref?.results.map((r) => r.title), ['Tour pro driver tempo']);
			assert.match(ref!.results[0]!.href, /^\/videos\/[0-9a-f-]{36}$/);
		})
	);

	it.effect('finds message text with a snippet, linking the conversation or the exact video thread', () =>
		Effect.gen(function* () {
			const { coach, player, conv, db, search, chat } = yield* world('s4');
			const video = (yield* db.maybeOne<{ id: string }>(`insert into videos (owner_id, kind, status, title) values ($1, 'swing', 'ready', 'Range day') returning id`, [player.id]))!;
			const long = `${'Thanks for the session. '.repeat(8)}My transition tempo felt rushed on the way down. ${'Talk soon. '.repeat(8)}`;
			yield* chat.send({ conversation: conv, senderId: player.id, senderName: 'P', body: long });
			yield* chat.send({ conversation: conv, senderId: player.id, senderName: 'P', body: 'Check the backswing here', videoId: video.id, videoMs: 1200 });
			const general = (yield* search.run(coach.id, 'tempo')).find((g) => g.kind === 'message')!;
			assert.strictEqual(general.results.length, 1);
			assert.include(general.results[0]!.snippet!, 'tempo');
			assert.isBelow(general.results[0]!.snippet!.length, 140);
			assert.strictEqual(general.results[0]!.href, `/messages/${conv.id}`);
			const thread = (yield* search.run(coach.id, 'bakcswing')).find((g) => g.kind === 'message')!;
			assert.strictEqual(thread.results[0]!.href, `/videos/${video.id}`);
			assert.include(thread.results[0]!.subtitle!, 'Range day');
		})
	);

	it.effect('finds only this coachs plans, drills, and private notes of players they coach', () =>
		Effect.gen(function* () {
			const { coach, player, db, search } = yield* world('s5');
			const users = yield* Users;
			const other = yield* users.ensure({ clerkUserId: 's5_other', role: 'coach' });
			const otherPlayer = yield* users.ensure({ clerkUserId: 's5_op', role: 'player' });
			yield* (yield* Coaching).assign(other.id, otherPlayer.id);
			yield* db.query(`insert into practice_plans (author_id, title) values ($1, 'Quarry putting ladder'), ($2, 'Quarry other coach plan')`, [coach.id, other.id]);
			yield* db.query(`insert into drills (name, category, purpose, cues, default_minutes) values ('Gate quarry drill', 'Putting', 'Start line control', 'Soft hands', 15)`);
			yield* (yield* Coaching).addNote(coach.id, player.id, 'Quarry reminder: work on lag putting speed');
			yield* (yield* Coaching).addNote(other.id, otherPlayer.id, 'Quarry secret note of the other coach');
			const groups = yield* search.run(coach.id, 'quary');
			assert.deepStrictEqual(groups.find((g) => g.kind === 'plan')?.results.map((r) => r.title), ['Quarry putting ladder']);
			assert.deepStrictEqual(groups.find((g) => g.kind === 'drill')?.results.map((r) => r.title), ['Gate quarry drill']);
			const notes = groups.find((g) => g.kind === 'note')!;
			assert.strictEqual(notes.results.length, 1);
			assert.strictEqual(notes.results[0]!.href, `/coach/players/${player.id}`);
			assert.include(notes.results[0]!.snippet!, 'lag putting');
			// a player id is never a coach id, so a player gets nothing at all through the service
			assert.deepStrictEqual(kinds(yield* search.run(player.id, 'quarry')), ['drill']);
		})
	);

	it.effect('caps each category and flags more', () =>
		Effect.gen(function* () {
			const { coach, db, search } = yield* world('s6');
			for (let i = 0; i < 8; i++) yield* db.query(`insert into practice_plans (author_id, title) values ($1, $2)`, [coach.id, `Zanzibar plan ${i}`]);
			const plans = (yield* search.run(coach.id, 'zanzibar')).find((g) => g.kind === 'plan')!;
			assert.strictEqual(plans.results.length, 5);
			assert.isTrue(plans.more);
		})
	);
});
