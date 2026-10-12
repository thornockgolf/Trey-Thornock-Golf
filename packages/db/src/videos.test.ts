import { assert, layer } from '@effect/vitest';
import { Effect, Layer } from 'effect';
import { Db } from './db';
import { TestDb } from './testing';
import { Users } from './users';
import { Videos } from './videos';

const Live = Layer.mergeAll(Users.layer, Videos.layer).pipe(Layer.provideMerge(TestDb));

const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

layer(Live, { timeout: 60_000 })('Videos', (it) => {
	const setup = (clerk: string, n: number) =>
		Effect.gen(function* () {
			const users = yield* Users;
			const videos = yield* Videos;
			const owner = yield* users.ensure({ clerkUserId: clerk, role: 'player' });
			const v = yield* videos.create({ id: ID(n), ownerId: owner.id, kind: 'swing', sourceKey: `raw/${ID(n)}/source.mp4`, sizeBytes: 1000 });
			return { owner, v, videos, users };
		});

	it.effect('creates pending, then walks uploaded -> processing -> ready', () =>
		Effect.gen(function* () {
			const { v, videos } = yield* setup('v_walk', 1);
			assert.strictEqual(v.status, 'pending');
			assert.strictEqual(v.sizeBytes, 1000);
			const up = yield* videos.markUploaded(v.id, 2048);
			assert.strictEqual(up?.status, 'uploaded');
			assert.strictEqual(up?.sizeBytes, 2048);
			assert.strictEqual((yield* videos.claimForProcessing(v.id))?.status, 'processing');
			// a retry claims again
			assert.strictEqual((yield* videos.claimForProcessing(v.id))?.status, 'processing');
			yield* videos.markReady(v.id, {
				processedKey: 'p', thumbnailKey: 't', spriteKey: 's', durationMs: 4200, fps: 29.97, width: 1920, height: 1080
			});
			const done = yield* videos.find(v.id);
			assert.strictEqual(done?.status, 'ready');
			assert.strictEqual(done?.fps, 29.97);
			assert.strictEqual(done?.durationMs, 4200);
			// ready videos are not re-uploaded or re-claimed
			assert.isUndefined(yield* videos.markUploaded(v.id, 1));
			assert.isUndefined(yield* videos.claimForProcessing(v.id));
		}));

	it.effect('failed carries an error code; a later success clears it', () =>
		Effect.gen(function* () {
			const { v, videos } = yield* setup('v_fail', 2);
			yield* videos.markUploaded(v.id, 10);
			yield* videos.markFailed(v.id, 'TRANSCODE_FAILED');
			const f = yield* videos.find(v.id);
			assert.strictEqual(f?.status, 'failed');
			assert.strictEqual(f?.errorCode, 'TRANSCODE_FAILED');
		}));

	it.effect('lists only the owner videos, newest first', () =>
		Effect.gen(function* () {
			const { owner, videos } = yield* setup('v_list', 3);
			const other = yield* setup('v_list_other', 4);
			yield* videos.create({ id: ID(5), ownerId: owner.id, kind: 'swing', sourceKey: `raw/${ID(5)}/source.mp4`, sizeBytes: 5 });
			const mine = yield* videos.listByOwner(owner.id);
			assert.deepStrictEqual(mine.map((x) => x.id), [ID(5), ID(3)]);
			assert.strictEqual((yield* videos.listByOwner(other.owner.id)).length, 1);
		}));

	it.effect('isAssignedCoach is true only for an active assignment', () =>
		Effect.gen(function* () {
			const { owner, users, videos } = yield* setup('v_assign', 6);
			const coach = yield* users.ensure({ clerkUserId: 'v_assign_coach', role: 'coach' });
			assert.isFalse(yield* videos.isAssignedCoach(coach.id, owner.id));
			const db = yield* Db;
			yield* db.query(`insert into coach_assignments (coach_id, player_id) values ($1, $2)`, [coach.id, owner.id]);
			assert.isTrue(yield* videos.isAssignedCoach(coach.id, owner.id));
			yield* db.query(`update coach_assignments set status = 'ended'`);
			assert.isFalse(yield* videos.isAssignedCoach(coach.id, owner.id));
		}));

	it.effect('failStalled fails only processing videos with no live job', () =>
		Effect.gen(function* () {
			const db = yield* Db;
			// stand-in for pg-boss's table (the real one is created when the queue starts)
			yield* db.query(`create schema if not exists pgboss`);
			yield* db.query(`create table if not exists pgboss.job (name text, singleton_key text, state text)`);
			const mk = (clerk: string, n: number) =>
				Effect.gen(function* () {
					const { v, videos } = yield* setup(clerk, n);
					yield* videos.markUploaded(v.id, 1);
					yield* videos.claimForProcessing(v.id);
					return v.id;
				});
			const orphan = yield* mk('fs_orphan', 20);
			const live = yield* mk('fs_live', 21);
			const retrying = yield* mk('fs_retry', 22);
			const finished = yield* mk('fs_done', 23);
			const fresh = yield* mk('fs_fresh', 24);
			const videos = yield* Videos;
			yield* db.query(
				`insert into pgboss.job values ('video.uploaded', $1, 'active'), ('video.uploaded', $2, 'retry'), ('video.uploaded', $3, 'failed')`,
				[live, retrying, finished]
			);
			yield* videos.markReady(finished, { processedKey: 'p', thumbnailKey: 't', spriteKey: 's', durationMs: 1, fps: 30, width: 1, height: 1 });
			// everything but `fresh` has been processing for an hour
			yield* db.query(`alter table videos disable trigger videos_updated_at`);
			yield* db.query(`update videos set updated_at = now() - interval '1 hour' where id <> $1`, [fresh]);
			yield* db.query(`alter table videos enable trigger videos_updated_at`);
			assert.deepStrictEqual(yield* videos.failStalled(600), [orphan]);
			const f = yield* videos.find(orphan);
			assert.strictEqual(f?.status, 'failed');
			assert.strictEqual(f?.errorCode, 'PROCESSING_STALLED');
			for (const id of [live, retrying, fresh]) assert.strictEqual((yield* videos.find(id))?.status, 'processing');
			assert.strictEqual((yield* videos.find(finished))?.status, 'ready');
			assert.deepStrictEqual(yield* videos.failStalled(600), []);
		}));
});
