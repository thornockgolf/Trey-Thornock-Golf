import { assert, layer } from '@effect/vitest';
import { Analyses, Db, Segments, Users, Videos } from '@ttg/db';
import { TestDb } from '@ttg/db/testing';
import { keys } from '@ttg/shared';
import { Effect, Layer } from 'effect';
import { sweepReplacedSegments } from './retention';
import { Storage } from './storage';

const Live = Layer.mergeAll(Users.layer, Videos.layer, Analyses.layer, Segments.layer).pipe(Layer.provideMerge(TestDb));
const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

layer(Live, { timeout: 60_000 })('sweepReplacedSegments', (it) => {
	const setup = (n: number) =>
		Effect.gen(function* () {
			// the sweep looks at every analysis, so start each test from an empty table
			yield* Effect.flatMap(Db, (db) => db.query(`delete from analysis_segments`));
			const coach = yield* (yield* Users).ensure({ clerkUserId: `ret_${n}`, role: 'coach' });
			const videoKey = keys.rawSource(ID(n), 'mp4');
			yield* (yield* Videos).create({ id: ID(n), ownerId: coach.id, kind: 'swing', sourceKey: videoKey, sizeBytes: 1 });
			const analysis = yield* (yield* Analyses).create({ videoId: ID(n), coachId: coach.id });
			const segs = yield* Segments;
			const mem = Storage.makeMemory();
			mem.objects.set(videoKey, { body: new Uint8Array([1, 2, 3]), contentType: 'video/mp4' });
			let next = n * 100;
			/** A recording that went live, with both of its objects in the bucket. */
			const record = (startMs: number, endMs: number) =>
				Effect.gen(function* () {
					const id = ID(++next);
					const raw = keys.analysisSegmentRaw(analysis.id, id, 'webm');
					const clip = keys.analysisSegment(analysis.id, id);
					yield* segs.createPending({ id, analysisId: analysis.id, startMs, endMs, sourceKey: raw, annotationsAction: 'keep' });
					yield* segs.markUploaded(id);
					yield* segs.claimForProcessing(id);
					yield* segs.commit(id, { clipKey: clip, hasVideo: false });
					mem.objects.set(raw, { body: new Uint8Array([9]), contentType: 'audio/webm' });
					mem.objects.set(clip, { body: new Uint8Array([8]), contentType: 'audio/mp4' });
					return { id, raw, clip };
				});
			const age = (id: string, days: number) =>
				Effect.flatMap(Db, (db) => db.query(`update analysis_segments set replaced_at = now() - make_interval(days => $2) where id = $1`, [id, days]));
			return { analysis, segs, mem, record, age, videoKey, run: sweepReplacedSegments.pipe(Effect.provideService(Storage, mem.service)) };
		});

	it.effect('deletes a segment replaced over 30 days ago: both objects and the row; a younger one is left alone', () =>
		Effect.gen(function* () {
			const { segs, mem, record, age, run } = yield* setup(1);
			const old = yield* record(0, 5_000);
			yield* record(0, 5_000); // replaces it
			const young = yield* record(10_000, 15_000);
			yield* record(10_000, 15_000); // replaces it
			yield* age(old.id, 31);
			yield* age(young.id, 5);

			const result = yield* run;
			assert.deepStrictEqual(result, { rows: 1, objects: 2, skipped: 0 });
			assert.isUndefined(yield* segs.find(old.id));
			assert.isFalse(mem.objects.has(old.raw));
			assert.isFalse(mem.objects.has(old.clip));
			assert.isDefined(yield* segs.find(young.id));
			assert.isTrue(mem.objects.has(young.raw));
			assert.isTrue(mem.objects.has(young.clip));
		})
	);

	it.effect('keeps the clip while a live trimmed piece still uses it, and deletes it once nothing does', () =>
		Effect.gen(function* () {
			const { analysis, segs, mem, record, age, run } = yield* setup(2);
			const take = yield* record(0, 30_000);
			const mid = yield* record(10_000, 15_000); // take is replaced; two trimmed pieces still play take's clip
			yield* age(take.id, 40);

			const first = yield* run;
			assert.deepStrictEqual(first, { rows: 1, objects: 0, skipped: 0 }); // row gone, clip and raw kept: the pieces use them
			assert.isTrue(mem.objects.has(take.clip));
			assert.isTrue(mem.objects.has(take.raw));
			assert.strictEqual((yield* segs.listLive(analysis.id)).length, 3);

			// later the pieces themselves are replaced and age out; the last one to go takes the objects with it
			yield* record(0, 30_000); // replaces take's two pieces and mid
			yield* Effect.flatMap(Db, (db) => db.query(`update analysis_segments set replaced_at = now() - interval '40 days' where replaced_at is not null and id <> $1`, [take.id]));
			const second = yield* run;
			assert.isAtLeast(second.rows, 3);
			assert.isFalse(mem.objects.has(take.clip));
			assert.isFalse(mem.objects.has(take.raw));
			assert.isFalse(mem.objects.has(mid.clip));
			assert.isFalse(mem.objects.has(mid.raw));
		})
	);

	it.effect('never deletes anything outside analysis/ (the source video stays), and a delete failure leaves the row for tomorrow', () =>
		Effect.gen(function* () {
			const { segs, mem, record, age, videoKey } = yield* setup(3);
			const rec = yield* record(0, 5_000);
			yield* record(0, 5_000);
			yield* age(rec.id, 31);
			// a storage that refuses: the row must survive so the next run retries
			const failing = { ...mem.service, deleteSegmentObject: () => Effect.fail(new (class extends Error {})('boom') as never) };
			const result = yield* sweepReplacedSegments.pipe(Effect.provideService(Storage, failing as never));
			assert.deepStrictEqual(result, { rows: 0, objects: 0, skipped: 1 });
			assert.isDefined(yield* segs.find(rec.id));
			assert.isTrue(mem.objects.has(videoKey));

			// the guard in Storage itself
			const refused = yield* Effect.exit(mem.service.deleteSegmentObject(videoKey));
			assert.strictEqual(refused._tag, 'Failure');
			assert.isTrue(mem.objects.has(videoKey));
			const traversal = yield* Effect.exit(mem.service.deleteSegmentObject('analysis/../raw/x/source.mp4'));
			assert.strictEqual(traversal._tag, 'Failure');
		})
	);

	it.effect('drops recordings that never finished after a day, with their raw upload', () =>
		Effect.gen(function* () {
			const { analysis, segs, mem, run } = yield* setup(4);
			const id = ID(9999);
			const raw = keys.analysisSegmentRaw(analysis.id, id, 'webm');
			yield* segs.createPending({ id, analysisId: analysis.id, startMs: 0, endMs: 1_000, sourceKey: raw, annotationsAction: 'keep' });
			mem.objects.set(raw, { body: new Uint8Array([1]), contentType: 'audio/webm' });
			assert.deepStrictEqual(yield* run, { rows: 0, objects: 0, skipped: 0 }); // too young
			yield* Effect.flatMap(Db, (db) => db.query(`update analysis_segments set created_at = now() - interval '2 days' where id = $1`, [id]));
			assert.deepStrictEqual(yield* run, { rows: 1, objects: 1, skipped: 0 });
			assert.isFalse(mem.objects.has(raw));
		})
	);
});
