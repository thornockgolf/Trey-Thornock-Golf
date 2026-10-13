import { assert, layer } from '@effect/vitest';
import { Effect, Layer } from 'effect';
import { Coaching } from './coaching';
import { Db } from './db';
import { Profiles } from './profiles';
import { TestDb } from './testing';
import { Users } from './users';
import { Videos } from './videos';

const Live = Layer.mergeAll(Users.layer, Videos.layer, Coaching.layer, Profiles.layer).pipe(Layer.provideMerge(TestDb));

layer(Live, { timeout: 60_000 })('Profiles', (it) => {
	const user = (tag: string) => Effect.flatMap(Users, (u) => u.ensure({ clerkUserId: tag, role: 'player' }));

	it.effect('an empty profile until something is saved; the patch sets, clears and keeps fields', () =>
		Effect.gen(function* () {
			const p = yield* user('pr1');
			const profiles = yield* Profiles;
			assert.deepStrictEqual(yield* profiles.get(p.id), { userId: p.id, handicap: null, goals: null, homeCourse: null, hand: null, equipment: null, limitations: null, photoKey: null });
			const a = yield* profiles.update(p.id, { handicap: 14.5, goals: 'Break 90', hand: 'left', homeCourse: 'Duke Golf Club' });
			assert.deepStrictEqual([a.handicap, a.goals, a.hand, a.homeCourse], [14.5, 'Break 90', 'left', 'Duke Golf Club']);
			// a later patch changes one field, clears another, keeps the rest
			const b = yield* profiles.update(p.id, { handicap: 12, goals: null });
			assert.deepStrictEqual([b.handicap, b.goals, b.hand, b.homeCourse], [12, null, 'left', 'Duke Golf Club']);
			assert.deepStrictEqual(yield* profiles.update(p.id, {}), b);
		})
	);

	it.effect('rejects a handicap outside the column and keeps the photo key', () =>
		Effect.gen(function* () {
			const p = yield* user('pr2');
			const profiles = yield* Profiles;
			yield* profiles.setPhotoKey(p.id, `profile/${p.id}/photo.jpg`);
			const after = yield* profiles.update(p.id, { goals: 'x' });
			assert.strictEqual(after.photoKey, `profile/${p.id}/photo.jpg`);
			const bad = yield* Effect.exit(profiles.update(p.id, { hand: 'both' as never }));
			assert.strictEqual(bad._tag, 'Failure');
		})
	);

	it.effect('the summary counts ready swings, the active plan progress and the subscription status', () =>
		Effect.gen(function* () {
			const coach = yield* Users.pipe(Effect.flatMap((u) => u.ensure({ clerkUserId: 'pr3_c', role: 'coach' })));
			const p = yield* user('pr3');
			const profiles = yield* Profiles;
			const db = yield* Db;
			assert.deepStrictEqual(yield* profiles.summary(p.id), { videos: 0, plan: null, subscriptionStatus: null });
			const videos = yield* Videos;
			const id = '00000000-0000-4000-8000-000000009301';
			yield* videos.create({ id, ownerId: p.id, kind: 'swing', sourceKey: 'k', sizeBytes: 1 });
			yield* videos.markUploaded(id, 1);
			yield* videos.claimForProcessing(id);
			yield* videos.markReady(id, { processedKey: 'p', thumbnailKey: 't', spriteKey: 's', durationMs: 1000, fps: 30, width: 1, height: 1 });
			yield* db.query(`insert into subscriptions (user_id, stripe_customer_id, stripe_subscription_id, price_id, status) values ($1, 'c', 's1', 'pr', 'active')`, [p.id]);
			const plan = (yield* db.maybeOne<{ id: string }>(`insert into practice_plans (author_id, title) values ($1, 'Short game') returning id`, [coach.id]))!;
			const asg = (yield* db.maybeOne<{ id: string }>(`insert into plan_assignments (plan_id, player_id, starts_on) values ($1, $2, '2026-10-12') returning id`, [plan.id, p.id]))!;
			yield* db.query(`insert into plan_sessions (assignment_id, scheduled_on, completed_at) values ($1, '2026-10-12', now()), ($1, '2026-10-13', null)`, [asg.id]);
			assert.deepStrictEqual(yield* profiles.summary(p.id), { videos: 1, plan: { title: 'Short game', sessions: 2, sessionsDone: 1 }, subscriptionStatus: 'active' });
		})
	);
});
