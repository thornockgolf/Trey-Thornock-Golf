import { assert, layer } from '@effect/vitest';
import { Effect, Layer } from 'effect';
import { Accounts } from './accounts';
import { Analyses } from './analyses';
import { Annotations } from './annotations';
import { Billing } from './billing';
import { Chat } from './chat';
import { Coaching } from './coaching';
import { Db } from './db';
import { Segments } from './segments';
import { TestDb } from './testing';
import { Users } from './users';
import { Videos } from './videos';

const Live = Layer.mergeAll(Users.layer, Videos.layer, Analyses.layer, Annotations.layer, Segments.layer, Coaching.layer, Chat.layer, Billing.layer, Accounts.layer).pipe(
	Layer.provideMerge(TestDb)
);
const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const arrow = { v: 1, type: 'arrow', color: '#D4A017', width: 0.005, a: { x: 0.1, y: 0.2 }, b: { x: 0.8, y: 0.9 } } as const;

layer(Live, { timeout: 60_000 })('Accounts', (it) => {
	/** A coach and a player with data in every table the deletion has to clear, plus a second player who must be untouched. */
	const seed = Effect.gen(function* () {
		const users = yield* Users;
		const db = yield* Db;
		const coach = yield* users.ensure({ clerkUserId: 'acc_coach', role: 'coach' });
		const p = yield* users.ensure({ clerkUserId: 'acc_player', role: 'player' });
		const other = yield* users.ensure({ clerkUserId: 'acc_other', role: 'player' });
		yield* users.setDisplayName(p.id, 'Sam Rivera');
		yield* db.query(`update users set email = 'sam@example.com' where id = $1`, [p.id]);
		yield* (yield* Coaching).assign(coach.id, p.id);
		yield* (yield* Coaching).assign(coach.id, other.id);
		const videos = yield* Videos;
		for (const [n, owner] of [[1, p.id], [2, other.id]] as const) {
			yield* videos.create({ id: ID(n), ownerId: owner, kind: 'swing', sourceKey: `raw/${ID(n)}/source.mp4`, sizeBytes: 1 });
			yield* db.query(`update videos set processed_key = $2, thumbnail_key = $3, sprite_key = $4 where id = $1`, [ID(n), `processed/${ID(n)}/video.mp4`, `processed/${ID(n)}/poster.jpg`, `processed/${ID(n)}/sprite.jpg`]);
		}
		const analysis = yield* (yield* Analyses).create({ videoId: ID(1), coachId: coach.id });
		yield* (yield* Annotations).create({ videoId: ID(1), authorId: coach.id, startMs: 0, endMs: 100, shape: arrow });
		yield* db.query(
			`insert into analysis_segments (analysis_id, position, start_ms, end_ms, clip_key, source_key, status) values ($1, 0, 0, 1000, $2, $3, 'ready')`,
			[analysis.id, `analysis/${analysis.id}/${ID(9)}.mp4`, `analysis/${analysis.id}/${ID(9)}.raw.webm`]
		);
		yield* db.query(`insert into player_profiles (user_id, goals, photo_key) values ($1, 'break 80', $2)`, [p.id, `profile/${p.id}/photo.jpg`]);
		yield* db.query(`insert into questionnaire_responses (user_id, version, answers) values ($1, 1, '{}')`, [p.id]);
		yield* db.query(`insert into push_subscriptions (user_id, endpoint, p256dh, auth) values ($1, 'https://fcm.googleapis.com/fcm/send/p', 'k', 'a'), ($2, 'https://fcm.googleapis.com/fcm/send/o', 'k', 'a')`, [p.id, other.id]);
		yield* db.query(`insert into coach_notes (assignment_id, body) select id, 'grip' from coach_assignments where player_id = $1`, [p.id]);
		yield* db.query(`insert into check_ins (player_id, scheduled_on) values ($1, current_date)`, [p.id]);
		const plan = yield* db.maybeOne<{ id: string }>(`insert into practice_plans (author_id, title) values ($1, 'Plan') returning id`, [coach.id]);
		const asg = yield* db.maybeOne<{ id: string }>(`insert into plan_assignments (plan_id, player_id, starts_on) values ($1, $2, current_date) returning id`, [plan!.id, p.id]);
		yield* db.query(`insert into plan_sessions (assignment_id, scheduled_on) values ($1, current_date)`, [asg!.id]);
		const assessment = yield* db.maybeOne<{ id: string }>(`insert into assessments (name) values ('Test') returning id`);
		yield* db.query(`insert into assessment_results (assessment_id, player_id, value) values ($1, $2, 3)`, [assessment!.id, p.id]);
		// chat both ways, with notifications for each side, and one about the player's video
		const conv = yield* db.maybeOne<{ id: string }>(`select id from conversations where player_id = $1`, [p.id]);
		yield* db.query(`insert into messages (conversation_id, sender_id, body, video_id) values ($1, $2, 'hi', $3), ($1, $4, 'hello', null)`, [conv!.id, p.id, ID(1), coach.id]);
		yield* db.query(
			`insert into notifications (user_id, type, payload) values
			 ($1, 'video_ready', jsonb_build_object('videoId', $2::text)),
			 ($3, 'message', jsonb_build_object('conversationId', $4::text, 'senderId', $1::text)),
			 ($3, 'check_in_submitted', jsonb_build_object('playerId', $1::text)),
			 ($3, 'message', jsonb_build_object('conversationId', 'someone-else')),
			 ($5, 'video_ready', jsonb_build_object('videoId', $6::text))`,
			[p.id, ID(1), coach.id, conv!.id, other.id, ID(2)]
		);
		// billing that must survive
		yield* (yield* Billing).processEvent({ id: 'evt_acc', type: 'test' }, (tx) =>
			Effect.gen(function* () {
				yield* tx.recordPayment({ userId: p.id, kind: 'assessment', stripePaymentIntentId: 'pi_acc', amountCents: 14900, currency: 'usd', status: 'paid', paidAt: new Date() });
			})
		);
		yield* db.query(`insert into stripe_customers (user_id, stripe_customer_id) values ($1, 'cus_acc')`, [p.id]);
		return { coach, p, other, analysisId: analysis.id };
	});

	const count = (sql: string, params: unknown[]) => Effect.flatMap(Effect.service(Db), (db) => db.maybeOne<{ n: string }>(sql, params)).pipe(Effect.map((r) => Number(r!.n)));

	it.effect('closes a player\'s account: locks it, lists the files, erases the rows and keeps the payments', () =>
		Effect.gen(function* () {
			const { coach, p, other, analysisId } = yield* seed;
			const accounts = yield* Accounts;

			// Not requested yet: nothing is erased.
			assert.strictEqual(yield* accounts.status(p.id), 'NotRequested');
			assert.isUndefined(yield* accounts.status(coach.id));
			assert.strictEqual(yield* accounts.erase(p.id), 'NotRequested');
			assert.isUndefined(yield* accounts.requestDeletion(coach.id)); // coaches cannot be deleted

			const target = yield* accounts.requestDeletion(p.id);
			assert.deepStrictEqual(target, { clerkUserId: 'acc_player', stripeCustomerId: 'cus_acc', deleted: false });
			assert.strictEqual(yield* accounts.status(p.id), 'Pending');
			assert.isTrue((yield* (yield* Users).findById(p.id))!.locked);
			assert.notInclude((yield* (yield* Coaching).listPlayers(coach.id)).map((x) => x.id), p.id);
			assert.strictEqual(yield* (yield* Coaching).assign(coach.id, p.id), 'NotAPlayer');
			assert.deepStrictEqual(yield* accounts.requestDeletion(p.id), target); // repeatable

			assert.sameMembers([...(yield* accounts.objectKeys(p.id))], [
				`raw/${ID(1)}/source.mp4`,
				`processed/${ID(1)}/video.mp4`,
				`processed/${ID(1)}/poster.jpg`,
				`processed/${ID(1)}/sprite.jpg`,
				`processed/${ID(1)}/sprite.vtt`,
				`analysis/${analysisId}/${ID(9)}.mp4`,
				`analysis/${analysisId}/${ID(9)}.raw.webm`,
				`profile/${p.id}/photo.jpg`
			]);

			assert.strictEqual(yield* accounts.erase(p.id), 'Erased');
			assert.strictEqual(yield* accounts.erase(p.id), 'AlreadyErased');
			assert.strictEqual(yield* accounts.status(p.id), 'Erased');

			// Everything of the player's is gone ...
			const gone = [
				['videos', 'owner_id'], ['player_profiles', 'user_id'], ['questionnaire_responses', 'user_id'], ['check_ins', 'player_id'],
				['plan_assignments', 'player_id'], ['assessment_results', 'player_id'], ['conversations', 'player_id'], ['coach_assignments', 'player_id'], ['notifications', 'user_id'], ['push_subscriptions', 'user_id']
			] as const;
			for (const [table, col] of gone) assert.strictEqual(yield* count(`select count(*) as n from ${table} where ${col} = $1`, [p.id]), 0, table);
			assert.strictEqual(yield* count(`select count(*) as n from analyses where video_id = $1`, [ID(1)]), 0);
			assert.strictEqual(yield* count(`select count(*) as n from annotations where video_id = $1`, [ID(1)]), 0);
			assert.strictEqual(yield* count(`select count(*) as n from analysis_segments where analysis_id = $1`, [analysisId]), 0);
			assert.strictEqual(yield* count(`select count(*) as n from messages`, []), 0);
			assert.strictEqual(yield* count(`select count(*) as n from coach_notes`, []), 0);
			assert.strictEqual(yield* count(`select count(*) as n from plan_sessions`, []), 0);
			// ... including what pointed at it in the coach's notifications, but not the coach's unrelated one.
			const left = yield* count(`select count(*) as n from notifications where user_id = $1`, [coach.id]);
			assert.strictEqual(left, 1);

			// The other player is untouched.
			assert.strictEqual(yield* count(`select count(*) as n from videos where owner_id = $1`, [other.id]), 1);
			assert.strictEqual(yield* count(`select count(*) as n from notifications where user_id = $1`, [other.id]), 1);
			assert.strictEqual(yield* count(`select count(*) as n from coach_assignments where player_id = $1`, [other.id]), 1);
			assert.strictEqual(yield* count(`select count(*) as n from push_subscriptions where user_id = $1`, [other.id]), 1);

			// Payments and the Stripe link stay, on a scrubbed tombstone.
			assert.strictEqual(yield* count(`select count(*) as n from payments where user_id = $1`, [p.id]), 1);
			assert.strictEqual(yield* count(`select count(*) as n from stripe_customers where user_id = $1`, [p.id]), 1);
			const tomb = yield* (yield* Db).maybeOne<{ clerk_user_id: string; display_name: string | null; email: string | null; deleted_at: Date | null }>(
				`select clerk_user_id, display_name, email, deleted_at from users where id = $1`,
				[p.id]
			);
			assert.deepStrictEqual({ ...tomb, deleted_at: tomb!.deleted_at !== null }, { clerk_user_id: `deleted:${p.id}`, display_name: null, email: null, deleted_at: true });
			// A new sign-up with the old Clerk id would be a fresh account, not the tombstone.
			const again = yield* (yield* Users).ensure({ clerkUserId: 'acc_player', role: 'player' });
			assert.notStrictEqual(again.id, p.id);
			assert.deepStrictEqual((yield* accounts.requestDeletion(p.id))?.deleted, true);
		})
	);
});
