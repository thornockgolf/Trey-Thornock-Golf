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
	it.effect('videosToRecord: ready swing videos of active players with no live recording from this coach, newest first', () =>
		Effect.gen(function* () {
			const { coach, a, b, coaching, users } = yield* setup('c5');
			const other = yield* users.ensure({ clerkUserId: 'c5_other_coach', role: 'coach' });
			const db = yield* Db;
			yield* coaching.assign(coach.id, a.id);
			const mk = (id: string, owner: string, kind: string, status: string, ago: number) =>
				db.query(
					`insert into videos (id, owner_id, kind, status, title, thumbnail_key, created_at) values ($1, $2, $3, $4, $5, 'thumb', now() - ($6 || ' hours')::interval)`,
					[id, owner, kind, status, `v${id.slice(-4)}`, String(ago)]
				);
			yield* mk(ID(5001), a.id, 'swing', 'ready', 5); // to record
			yield* mk(ID(5002), a.id, 'swing', 'ready', 1); // to record, newest
			yield* mk(ID(5003), a.id, 'swing', 'ready', 2); // recorded
			yield* mk(ID(5004), a.id, 'swing', 'processing', 2); // not ready
			yield* mk(ID(5005), a.id, 'reference', 'ready', 2); // not a swing
			yield* mk(ID(5006), b.id, 'swing', 'ready', 2); // b not assigned
			yield* mk(ID(5007), a.id, 'swing', 'ready', 3); // analysis started, no recording
			yield* mk(ID(5008), a.id, 'swing', 'ready', 4); // only a failed segment
			yield* mk(ID(5009), a.id, 'swing', 'ready', 6); // recorded only by another coach
			const analysis = (id: string, vid: string, who: string) =>
				db.query(`insert into analyses (id, video_id, coach_id) values ($1, $2, $3)`, [id, vid, who]);
			const segment = (aid: string, status: string, replaced: boolean) =>
				db.query(`insert into analysis_segments (analysis_id, position, start_ms, end_ms, status, replaced_at) values ($1, 0, 0, 100, $2, ${replaced ? 'now()' : 'null'})`, [aid, status]);
			yield* analysis(ID(5103), ID(5003), coach.id);
			yield* segment(ID(5103), 'ready', false);
			yield* analysis(ID(5107), ID(5007), coach.id);
			yield* analysis(ID(5108), ID(5008), coach.id);
			yield* segment(ID(5108), 'failed', false);
			yield* analysis(ID(5109), ID(5009), other.id);
			yield* segment(ID(5109), 'ready', false);
			const list = yield* coaching.videosToRecord(coach.id);
			assert.deepStrictEqual(list.map((v) => v.videoId), [ID(5002), ID(5007), ID(5008), ID(5001), ID(5009)]);
			assert.strictEqual(list[0]!.playerId, a.id);
			assert.strictEqual(list[0]!.thumbnailKey, 'thumb');
			// ending the relationship hides the player's videos
			yield* coaching.end(coach.id, a.id);
			assert.deepStrictEqual(yield* coaching.videosToRecord(coach.id), []);
		})
	);

	it.effect('unreadFromPlayers: one row per thread, only unread messages from the coach\'s active players', () =>
		Effect.gen(function* () {
			const { coach, a, b, coaching, users } = yield* setup('c6');
			const db = yield* Db;
			yield* coaching.assign(coach.id, a.id);
			yield* coaching.assign(coach.id, b.id);
			yield* db.query(`insert into videos (id, owner_id, kind, status, title) values ($1, $2, 'swing', 'ready', 'Driver')`, [ID(6001), a.id]);
			const conv = (yield* db.maybeOne<{ id: string }>(`select id from conversations where coach_id = $1 and player_id = $2`, [coach.id, a.id]))!.id;
			const convB = (yield* db.maybeOne<{ id: string }>(`select id from conversations where coach_id = $1 and player_id = $2`, [coach.id, b.id]))!.id;
			const msg = (c: string, sender: string, body: string, video: string | null, read: boolean, ago: number) =>
				db.query(
					`insert into messages (conversation_id, sender_id, body, video_id, read_at, created_at) values ($1, $2, $3, $4, ${read ? 'now()' : 'null'}, now() - ($5 || ' minutes')::interval)`,
					[c, sender, body, video, String(ago)]
				);
			yield* msg(conv, a.id, 'general old', null, false, 30);
			yield* msg(conv, a.id, 'general new', null, false, 20);
			yield* msg(conv, a.id, 'about driver', ID(6001), false, 5);
			yield* msg(conv, a.id, 'already read', null, true, 40);
			yield* msg(conv, coach.id, 'coach reply', null, false, 1); // sent by the coach: not counted
			yield* msg(convB, b.id, 'hello from b', null, false, 10);
			const threads = yield* coaching.unreadFromPlayers(coach.id);
			assert.deepStrictEqual(
				threads.map((t) => [t.playerId === a.id ? 'a' : 'b', t.videoId, t.unread, t.preview, t.videoTitle]),
				[['a', ID(6001), 1, 'about driver', 'Driver'], ['b', null, 1, 'hello from b', null], ['a', null, 2, 'general new', null]]
			);
			assert.strictEqual(threads[0]!.conversationId, conv);
			const other = yield* users.ensure({ clerkUserId: 'c6_other', role: 'coach' });
			assert.deepStrictEqual(yield* coaching.unreadFromPlayers(other.id), []);
			yield* coaching.end(coach.id, b.id);
			assert.strictEqual((yield* coaching.unreadFromPlayers(coach.id)).length, 2);
		})
	);
});
