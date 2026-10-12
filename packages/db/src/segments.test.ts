import { assert, layer } from '@effect/vitest';
import { Effect, Layer } from 'effect';
import { Analyses } from './analyses';
import { Annotations } from './annotations';
import { Db } from './db';
import { Segments } from './segments';
import { TestDb } from './testing';
import { Users } from './users';
import { Videos } from './videos';

const Live = Layer.mergeAll(Users.layer, Videos.layer, Analyses.layer, Annotations.layer, Segments.layer).pipe(Layer.provideMerge(TestDb));
const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const arrow = { v: 1, type: 'arrow', color: '#D4A017', width: 0.005, a: { x: 0.1, y: 0.2 }, b: { x: 0.8, y: 0.9 } } as const;

layer(Live, { timeout: 60_000 })('Segments', (it) => {
	/** An analysis (video n, 30 s) with helpers to record a segment the way the app and worker do. */
	const setup = (clerk: string, n: number) =>
		Effect.gen(function* () {
			const users = yield* Users;
			const coach = yield* users.ensure({ clerkUserId: `${clerk}_c`, role: 'coach' });
			const videos = yield* Videos;
			yield* videos.create({ id: ID(n), ownerId: coach.id, kind: 'swing', sourceKey: `raw/${ID(n)}/source.mp4`, sizeBytes: 1 });
			const analysis = yield* (yield* Analyses).create({ videoId: ID(n), coachId: coach.id });
			const segs = yield* Segments;
			let next = n * 1000;
			/** pending -> uploaded -> processing -> commit, like the app plus the worker. */
			const record = (startMs: number, endMs: number, annotationsAction: 'keep' | 'remove' = 'keep') =>
				Effect.gen(function* () {
					const id = ID(++next);
					yield* segs.createPending({ id, analysisId: analysis.id, startMs, endMs, sourceKey: `analysis/${analysis.id}/${id}.raw.webm`, annotationsAction });
					yield* segs.markUploaded(id);
					yield* segs.claimForProcessing(id);
					const result = yield* segs.commit(id, { clipKey: `analysis/${analysis.id}/${id}.mp4`, hasVideo: false });
					return { id, result };
				});
			const shape = (rows: readonly { startMs: number; endMs: number; clipStartMs: number }[]) => rows.map((r) => [r.startMs, r.endMs, r.clipStartMs]);
			return { coach, analysis, segs, record, shape, annotations: yield* Annotations };
		});

	it.effect('a pending recording is not part of the analysis until it is committed', () =>
		Effect.gen(function* () {
			const { analysis, segs, record } = yield* setup('s1', 1);
			const first = yield* record(0, 30_000);
			assert.strictEqual((yield* segs.listLive(analysis.id)).length, 1);
			const id = ID(1900);
			yield* segs.createPending({ id, analysisId: analysis.id, startMs: 10_000, endMs: 15_000, sourceKey: 'k', annotationsAction: 'keep' });
			yield* segs.markUploaded(id);
			yield* segs.claimForProcessing(id);
			// the worker fails: the earlier recording is untouched
			yield* segs.markFailed(id, 'TRANSCODE_FAILED');
			const live = yield* segs.listLive(analysis.id);
			assert.deepStrictEqual(live.map((s) => s.id), [first.id]);
			assert.strictEqual((yield* segs.find(id))?.status, 'failed');
		})
	);

	it.effect('re-recording the middle of a take keeps the outside parts as trimmed pieces of the same clip', () =>
		Effect.gen(function* () {
			const { analysis, segs, record, shape } = yield* setup('s2', 2);
			const take = yield* record(0, 30_000);
			const clip = (yield* segs.find(take.id))!.clipKey;
			const mid = yield* record(10_000, 15_000);
			assert.deepStrictEqual(mid.result, { replaced: 1, removedAnnotations: 0 });
			const live = yield* segs.listLive(analysis.id);
			assert.deepStrictEqual(shape(live), [[0, 10_000, 0], [10_000, 15_000, 0], [15_000, 30_000, 15_000]]);
			// the outside pieces point at the original object; the new one at its own
			assert.strictEqual(live[0]!.clipKey, clip);
			assert.strictEqual(live[2]!.clipKey, clip);
			assert.notStrictEqual(live[1]!.clipKey, clip);
			// the original row is kept (replaced), not deleted
			const old = (yield* segs.find(take.id))!;
			assert.isNotNull(old.replacedAt);
		})
	);

	it.effect('only segments that overlap are replaced; the others keep their rows', () =>
		Effect.gen(function* () {
			const { analysis, segs, record } = yield* setup('s3', 3);
			const a = yield* record(0, 10_000);
			const b = yield* record(10_000, 15_000);
			const c = yield* record(15_000, 30_000);
			yield* record(10_000, 15_000);
			const ids = (yield* segs.listLive(analysis.id)).map((s) => s.id);
			assert.include(ids, a.id);
			assert.include(ids, c.id);
			assert.notInclude(ids, b.id);
			assert.strictEqual(ids.length, 3);
		})
	);

	it.effect('committing twice changes nothing the second time', () =>
		Effect.gen(function* () {
			const { analysis, segs, record } = yield* setup('s4', 4);
			const first = yield* record(0, 5_000);
			const again = yield* segs.commit(first.id, { clipKey: 'other', hasVideo: true });
			assert.isUndefined(again);
			const live = yield* segs.listLive(analysis.id);
			assert.strictEqual(live.length, 1);
			assert.notStrictEqual(live[0]!.clipKey, 'other');
		})
	);

	it.effect('annotations outside the range are untouched; inside they are kept by default or removed and restored by undo', () =>
		Effect.gen(function* () {
			const { coach, analysis, segs, record, annotations } = yield* setup('s5', 5);
			const mk = (ms: number) => annotations.create({ videoId: ID(5), authorId: coach.id, startMs: ms, endMs: ms + 500, shape: arrow });
			yield* mk(3_000);
			yield* mk(12_000);
			yield* mk(22_000);
			yield* record(0, 30_000);
			assert.strictEqual(yield* segs.countAnnotationsIn(analysis.id, 10_000, 15_000), 1);

			// default keep: all three remain
			yield* record(10_000, 15_000);
			assert.strictEqual((yield* annotations.listByVideo(ID(5))).length, 3);

			// remove: only the one at 12 s goes
			const removed = yield* record(10_000, 15_000, 'remove');
			assert.strictEqual(removed.result?.removedAnnotations, 1);
			assert.deepStrictEqual((yield* annotations.listByVideo(ID(5))).map((a) => a.startMs), [3_000, 22_000]);

			// undo brings it back, with its shape and times
			const undo = yield* segs.undoLast(analysis.id, 30);
			assert.deepStrictEqual(undo, { _tag: 'Undone', restored: 1, restoredAnnotations: 1 });
			const after = yield* annotations.listByVideo(ID(5));
			assert.deepStrictEqual(after.map((a) => a.startMs), [3_000, 12_000, 22_000]);
			assert.deepStrictEqual(after[1]!.shape, arrow);
		})
	);

	it.effect('undo restores the replaced segments and removes the pieces; it can be repeated back to nothing', () =>
		Effect.gen(function* () {
			const { analysis, segs, record, shape } = yield* setup('s6', 6);
			yield* record(0, 30_000);
			yield* record(10_000, 15_000);
			assert.strictEqual((yield* segs.listLive(analysis.id)).length, 3);

			const first = yield* segs.undoLast(analysis.id, 30);
			assert.strictEqual(first._tag, 'Undone');
			assert.deepStrictEqual(shape(yield* segs.listLive(analysis.id)), [[0, 30_000, 0]]);

			const second = yield* segs.undoLast(analysis.id, 30);
			assert.strictEqual(second._tag, 'Undone');
			assert.strictEqual((yield* segs.listLive(analysis.id)).length, 0);
			assert.deepStrictEqual(yield* segs.undoLast(analysis.id, 30), { _tag: 'NothingToUndo' });
		})
	);

	it.effect('undo is refused once the operation is older than the retention window', () =>
		Effect.gen(function* () {
			const { analysis, segs, record } = yield* setup('s7', 7);
			const take = yield* record(0, 30_000);
			const mid = yield* record(10_000, 15_000);
			yield* (yield* Db).query(`update analysis_segments set committed_at = now() - interval '31 days', replaced_at = case when replaced_at is not null then now() - interval '31 days' end where id in ($1, $2)`, [take.id, mid.id]);
			assert.deepStrictEqual(yield* segs.undoLast(analysis.id, 30), { _tag: 'Expired' });
			assert.strictEqual((yield* segs.listLive(analysis.id)).length, 3);
		})
	);

	it.effect('retention: replaced rows older than 30 days are deletable, and a shared clip is reported as in use', () =>
		Effect.gen(function* () {
			const { analysis, segs, record } = yield* setup('s8', 8);
			const take = yield* record(0, 30_000);
			const clip = (yield* segs.find(take.id))!.clipKey!;
			const mid = yield* record(10_000, 15_000);
			const db = yield* Db;
			assert.strictEqual((yield* segs.listDeletable({ abandonedSeconds: 86_400, replacedDays: 30 })).filter((s) => s.analysisId === analysis.id).length, 0);
			yield* db.query(`update analysis_segments set replaced_at = now() - interval '31 days' where id = $1`, [take.id]);
			const due = (yield* segs.listDeletable({ abandonedSeconds: 86_400, replacedDays: 30 })).filter((s) => s.analysisId === analysis.id);
			assert.deepStrictEqual(due.map((s) => s.id), [take.id]);
			// two live pieces still use the old clip, so it must not be deleted yet
			assert.isTrue(yield* segs.keyInUse(clip, [take.id]));
			// the new recording's own clip is used by nothing else
			assert.isFalse(yield* segs.keyInUse((yield* segs.find(mid.id))!.clipKey!, [mid.id]));
			yield* segs.deleteRow(take.id);
			assert.isUndefined(yield* segs.find(take.id));
		})
	);

	it.effect('retention also finds recordings that never finished (failed or abandoned) after a day', () =>
		Effect.gen(function* () {
			const { analysis, segs } = yield* setup('s9', 9);
			const id = ID(9900);
			yield* segs.createPending({ id, analysisId: analysis.id, startMs: 0, endMs: 1000, sourceKey: 'k', annotationsAction: 'keep' });
			const none = (yield* segs.listDeletable({ abandonedSeconds: 86_400, replacedDays: 30 })).filter((s) => s.id === id);
			assert.strictEqual(none.length, 0);
			yield* (yield* Db).query(`update analysis_segments set created_at = now() - interval '2 days' where id = $1`, [id]);
			const found = (yield* segs.listDeletable({ abandonedSeconds: 86_400, replacedDays: 30 })).filter((s) => s.id === id);
			assert.strictEqual(found.length, 1);
		})
	);

	it.effect('positions are never reused, so a restored segment cannot collide with a new one', () =>
		Effect.gen(function* () {
			const { analysis, segs, record } = yield* setup('s10', 10);
			yield* record(0, 30_000);
			yield* record(10_000, 15_000);
			yield* segs.undoLast(analysis.id, 30);
			yield* record(5_000, 8_000);
			const all = yield* segs.listAll(analysis.id);
			assert.strictEqual(new Set(all.map((s) => s.position)).size, all.length);
		})
	);
});
