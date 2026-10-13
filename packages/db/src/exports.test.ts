import { assert, layer } from '@effect/vitest';
import { Effect, Layer } from 'effect';
import { Analyses } from './analyses';
import { Db } from './db';
import { AnalysisExports } from './exports';
import { TestDb } from './testing';
import { Users } from './users';
import { Videos } from './videos';

const Live = Layer.mergeAll(Users.layer, Videos.layer, Analyses.layer, AnalysisExports.layer).pipe(Layer.provideMerge(TestDb));
const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

layer(Live, { timeout: 60_000 })('AnalysisExports', (it) => {
	const analysis = (n: number) =>
		Effect.gen(function* () {
			const users = yield* Users;
			const coach = yield* users.ensure({ clerkUserId: `exp_coach_${n}`, role: 'coach' });
			const player = yield* users.ensure({ clerkUserId: `exp_player_${n}`, role: 'player' });
			yield* (yield* Videos).create({ id: ID(n), ownerId: player.id, kind: 'swing', sourceKey: `raw/${ID(n)}/source.mp4`, sizeBytes: 1 });
			return yield* (yield* Analyses).create({ videoId: ID(n), coachId: coach.id });
		});

	it.effect('queues once, hands one worker the job, and records the result', () =>
		Effect.gen(function* () {
			const exports = yield* AnalysisExports;
			const a = yield* analysis(1);
			assert.isUndefined(yield* exports.find(a.id));
			assert.isUndefined(yield* exports.claim(a.id)); // nothing requested

			const first = yield* exports.request(a.id);
			assert.deepInclude(first, { started: true });
			assert.strictEqual(first.export.status, 'queued');
			const again = yield* exports.request(a.id);
			assert.isFalse(again.started); // already queued: no second job

			assert.strictEqual((yield* exports.claim(a.id))!.status, 'processing');
			assert.strictEqual((yield* exports.claim(a.id))!.status, 'processing'); // a retry may claim again
			assert.isFalse((yield* exports.request(a.id)).started);

			yield* exports.markReady(a.id, { outputKey: `analysis/${a.id}/export.mp4`, sizeBytes: 12345 });
			const ready = (yield* exports.find(a.id))!;
			assert.deepInclude(ready, { status: 'ready', outputKey: `analysis/${a.id}/export.mp4`, sizeBytes: 12345, errorCode: null });
			assert.isNotNull(ready.readyAt);
			assert.isUndefined(yield* exports.claim(a.id)); // finished: a repeated job does nothing

			// asking again re-queues, and keeps the old file until the new one is ready
			const redo = yield* exports.request(a.id);
			assert.isTrue(redo.started);
			assert.deepInclude(redo.export, { status: 'queued', outputKey: `analysis/${a.id}/export.mp4`, readyAt: null });
		})
	);

	it.effect('records a failure, lets the coach ask again, and restarts a request that was lost', () =>
		Effect.gen(function* () {
			const exports = yield* AnalysisExports;
			const db = yield* Db;
			const a = yield* analysis(2);
			yield* exports.request(a.id);
			yield* exports.claim(a.id);
			yield* exports.markFailed(a.id, 'TRANSCODE_FAILED');
			assert.deepInclude((yield* exports.find(a.id))!, { status: 'failed', errorCode: 'TRANSCODE_FAILED' });
			yield* exports.markFailed(a.id, 'OTHER'); // only an unfinished export can fail
			assert.strictEqual((yield* exports.find(a.id))!.errorCode, 'TRANSCODE_FAILED');

			const retry = yield* exports.request(a.id);
			assert.isTrue(retry.started);
			assert.isNull(retry.export.errorCode);

			yield* db.query(`update analysis_exports set requested_at = now() - interval '2 hours' where analysis_id = $1`, [a.id]);
			assert.isTrue((yield* exports.request(a.id)).started); // queued 2 hours ago with no result: lost
		})
	);
});
