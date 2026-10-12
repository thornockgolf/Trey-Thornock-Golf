import { assert, layer } from '@effect/vitest';
import { Effect, Layer } from 'effect';
import { Assessments } from './assessments';
import { CheckIns } from './checkins';
import { Coaching } from './coaching';
import { Db } from './db';
import { TestDb } from './testing';
import { Users } from './users';

const Live = Layer.mergeAll(Users.layer, Coaching.layer, CheckIns.layer, Assessments.layer).pipe(Layer.provideMerge(TestDb));
const ans = { roundsPlayed: 2, confidence: 4, issues: 'Pulled irons' };

layer(Live, { timeout: 60_000 })('CheckIns', (it) => {
	const setup = (tag: string) =>
		Effect.gen(function* () {
			const users = yield* Users;
			const coach = yield* users.ensure({ clerkUserId: `${tag}_c`, role: 'coach' });
			const player = yield* users.ensure({ clerkUserId: `${tag}_p`, role: 'player' });
			const other = yield* users.ensure({ clerkUserId: `${tag}_o`, role: 'player' });
			yield* (yield* Coaching).assign(coach.id, player.id);
			return { coach, player, other, checkIns: yield* CheckIns, db: yield* Db };
		});

	it.effect('schedules one or several, notifies the player, and needs an active relationship', () =>
		Effect.gen(function* () {
			const { coach, player, other, checkIns, db } = yield* setup('ci1');
			assert.deepStrictEqual(yield* checkIns.schedule({ coachId: coach.id, playerId: other.id, dates: ['2026-10-20'] }), { _tag: 'NotPaired' });
			const r = yield* checkIns.schedule({ coachId: coach.id, playerId: player.id, dates: ['2026-10-20', '2026-10-27'] });
			assert.strictEqual(r._tag, 'Scheduled');
			assert.deepStrictEqual((yield* checkIns.listForPlayer(player.id)).map((c) => [c.scheduledOn, c.submittedAt, c.answers]), [['2026-10-20', null, null], ['2026-10-27', null, null]]);
			const n = yield* db.query<{ type: string }>(`select type from notifications where user_id = $1`, [player.id]);
			assert.deepStrictEqual(n.map((x) => x.type), ['check_in_scheduled']);
		})
	);

	it.effect('the player submits once; the coach is notified; nobody else can submit it', () =>
		Effect.gen(function* () {
			const { coach, player, other, checkIns, db } = yield* setup('ci2');
			const made = yield* checkIns.schedule({ coachId: coach.id, playerId: player.id, dates: ['2026-10-20'] });
			const id = made._tag === 'Scheduled' ? made.checkIns[0]!.id : '';
			assert.deepStrictEqual(yield* checkIns.submit({ playerId: other.id, id, answers: ans }), { _tag: 'Missing' });
			const done = yield* checkIns.submit({ playerId: player.id, id, answers: ans });
			assert.strictEqual(done._tag, 'Submitted');
			if (done._tag === 'Submitted') {
				assert.deepStrictEqual(done.checkIn.answers, ans);
				assert.isNotNull(done.checkIn.submittedAt);
			}
			assert.deepStrictEqual(yield* checkIns.submit({ playerId: player.id, id, answers: { roundsPlayed: 0, confidence: 1 } }), { _tag: 'AlreadySubmitted' });
			const n = yield* db.query<{ type: string }>(`select type from notifications where user_id = $1`, [coach.id]);
			assert.deepStrictEqual(n.map((x) => x.type), ['check_in_submitted']);
			assert.deepStrictEqual((yield* checkIns.get(id))?.answers, ans);
		})
	);
});

layer(Live, { timeout: 60_000 })('Assessments', (it) => {
	const setup = (tag: string) =>
		Effect.gen(function* () {
			const users = yield* Users;
			const coach = yield* users.ensure({ clerkUserId: `${tag}_c`, role: 'coach' });
			const player = yield* users.ensure({ clerkUserId: `${tag}_p`, role: 'player' });
			const other = yield* users.ensure({ clerkUserId: `${tag}_o`, role: 'player' });
			yield* (yield* Coaching).assign(coach.id, player.id);
			const as = yield* Assessments;
			const def = yield* as.define({ name: `Carry distance ${tag}`, unit: 'yd', description: '7 iron, average of 5' });
			const test = def._tag === 'Defined' ? def.assessment : undefined;
			return { coach, player, other, as, test: test!, db: yield* Db };
		});

	it.effect('defines a test once per name', () =>
		Effect.gen(function* () {
			const { as, test } = yield* setup('as1');
			assert.deepStrictEqual(yield* as.define({ name: test.name }), { _tag: 'NameTaken' });
			assert.include((yield* as.list()).map((a) => a.name), test.name);
		})
	);

	it.effect('a scheduled test has no value; recording fills it and the player sees the trend against the previous result', () =>
		Effect.gen(function* () {
			const { coach, player, as, test } = yield* setup('as2');
			const s1 = yield* as.schedule({ coachId: coach.id, playerId: player.id, assessmentId: test.id, scheduledOn: '2026-10-10' });
			assert.strictEqual(s1._tag, 'Scheduled');
			if (s1._tag === 'Scheduled') assert.deepStrictEqual([s1.result.value, s1.result.trend, s1.result.date], [null, null, '2026-10-10']);
			const first = (yield* as.resultsForPlayer(player.id))[0]!;
			const r1 = yield* as.record({ coachId: coach.id, playerId: player.id, assessmentId: test.id, value: 140, resultId: first.id });
			assert.strictEqual(r1._tag, 'Recorded');
			if (r1._tag === 'Recorded') assert.deepStrictEqual([r1.result.value, r1.result.previousValue, r1.result.trend], [140, null, null]);

			const s2 = yield* as.schedule({ coachId: coach.id, playerId: player.id, assessmentId: test.id, scheduledOn: '2026-10-24' });
			const id2 = s2._tag === 'Scheduled' ? s2.result.id : '';
			const r2 = yield* as.record({ coachId: coach.id, playerId: player.id, assessmentId: test.id, value: 147, resultId: id2 });
			if (r2._tag === 'Recorded') assert.deepStrictEqual([r2.result.value, r2.result.previousValue, r2.result.change, r2.result.trend], [147, 140, 7, 'up']);
			// the same scheduled test cannot be recorded twice
			assert.deepStrictEqual(yield* as.record({ coachId: coach.id, playerId: player.id, assessmentId: test.id, value: 1, resultId: id2 }), { _tag: 'Missing' });
		})
	);

	it.effect('ad-hoc results work, belong to the player, and need an active relationship', () =>
		Effect.gen(function* () {
			const { coach, player, other, as, test, db } = yield* setup('as3');
			assert.deepStrictEqual(yield* as.record({ coachId: coach.id, playerId: other.id, assessmentId: test.id, value: 5 }), { _tag: 'NotPaired' });
			assert.deepStrictEqual(yield* as.schedule({ coachId: coach.id, playerId: other.id, assessmentId: test.id, scheduledOn: '2026-10-10' }), { _tag: 'NotPaired' });
			const r = yield* as.record({ coachId: coach.id, playerId: player.id, assessmentId: test.id, value: 150.5 });
			assert.strictEqual(r._tag, 'Recorded');
			assert.deepStrictEqual((yield* as.resultsForPlayer(other.id)), []);
			assert.deepStrictEqual((yield* as.listForPlayer(player.id)).map((a) => a.id), [test.id]);
			assert.deepStrictEqual(yield* as.listForPlayer(other.id), []);
			assert.deepStrictEqual(yield* as.record({ coachId: coach.id, playerId: player.id, assessmentId: '00000000-0000-4000-8000-0000000000ff', value: 1 }), { _tag: 'Missing' });
			const n = yield* db.query<{ type: string }>(`select type from notifications where user_id = $1`, [player.id]);
			assert.include(n.map((x) => x.type), 'assessment_result');
		})
	);

	it.effect('a result row needs a value or a schedule (database rule)', () =>
		Effect.gen(function* () {
			const { player, test, db } = yield* setup('as4');
			const exit = yield* Effect.exit(db.query(`insert into assessment_results (assessment_id, player_id) values ($1, $2)`, [test.id, player.id]));
			assert.strictEqual(exit._tag, 'Failure');
		})
	);
});
