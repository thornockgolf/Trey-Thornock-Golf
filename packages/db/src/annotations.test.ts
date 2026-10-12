import { assert, layer } from '@effect/vitest';
import type { AnnotationShape } from '@ttg/shared';
import { Effect, Layer } from 'effect';
import { Annotations } from './annotations';
import { TestDb } from './testing';
import { Users } from './users';
import { Videos } from './videos';

const Live = Layer.mergeAll(Users.layer, Videos.layer, Annotations.layer).pipe(Layer.provideMerge(TestDb));
const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const arrow: AnnotationShape = { v: 1, type: 'arrow', color: '#D4A017', width: 0.005, a: { x: 0.1, y: 0.2 }, b: { x: 0.8, y: 0.9 } };

layer(Live, { timeout: 60_000 })('Annotations', (it) => {
	const setup = (clerk: string, n: number) =>
		Effect.gen(function* () {
			const users = yield* Users;
			const videos = yield* Videos;
			const coach = yield* users.ensure({ clerkUserId: `${clerk}_c`, role: 'coach' });
			const video = yield* videos.create({ id: ID(n), ownerId: coach.id, kind: 'swing', sourceKey: `raw/${ID(n)}/source.mp4`, sizeBytes: 1 });
			return { coach, video, ann: yield* Annotations };
		});

	it.effect('creates, lists in timeline order and round-trips the shape', () =>
		Effect.gen(function* () {
			const { coach, video, ann } = yield* setup('a1', 1);
			const late = yield* ann.create({ videoId: video.id, authorId: coach.id, startMs: 3000, endMs: 4000, shape: arrow });
			const early = yield* ann.create({ videoId: video.id, authorId: coach.id, startMs: 2400, endMs: 3000, shape: arrow });
			assert.strictEqual(late.version, 1);
			assert.deepStrictEqual(early.shape, arrow);
			assert.deepStrictEqual((yield* ann.listByVideo(video.id)).map((a) => a.startMs), [2400, 3000]);
			assert.strictEqual(yield* ann.countByVideo(video.id), 2);
		})
	);

	it.effect('update bumps the version and a stale version is rejected', () =>
		Effect.gen(function* () {
			const { coach, video, ann } = yield* setup('a2', 2);
			const a = yield* ann.create({ videoId: video.id, authorId: coach.id, startMs: 100, endMs: 200, shape: arrow });
			const first = yield* ann.update({ id: a.id, videoId: video.id, version: 1, endMs: 900 });
			assert.strictEqual(first._tag, 'Updated');
			if (first._tag === 'Updated') {
				assert.strictEqual(first.annotation.version, 2);
				assert.strictEqual(first.annotation.endMs, 900);
				assert.strictEqual(first.annotation.startMs, 100); // untouched fields stay
				assert.deepStrictEqual(first.annotation.shape, arrow);
			}
			// the second session still holds version 1
			assert.strictEqual((yield* ann.update({ id: a.id, videoId: video.id, version: 1, endMs: 500 }))._tag, 'Stale');
			assert.strictEqual((yield* ann.listByVideo(video.id))[0]!.endMs, 900);
		})
	);

	it.effect('an id from another video is missing, not stale', () =>
		Effect.gen(function* () {
			const { coach, video, ann } = yield* setup('a3', 3);
			const other = yield* setup('a3b', 4);
			const a = yield* ann.create({ videoId: video.id, authorId: coach.id, startMs: 0, endMs: 1, shape: arrow });
			assert.strictEqual((yield* ann.update({ id: a.id, videoId: other.video.id, version: 1, endMs: 5 }))._tag, 'Missing');
			assert.strictEqual((yield* ann.remove({ id: a.id, videoId: other.video.id }))._tag, 'Missing');
		})
	);

	it.effect('remove honors an optional version', () =>
		Effect.gen(function* () {
			const { coach, video, ann } = yield* setup('a4', 5);
			const a = yield* ann.create({ videoId: video.id, authorId: coach.id, startMs: 0, endMs: 1, shape: arrow });
			assert.strictEqual((yield* ann.remove({ id: a.id, videoId: video.id, version: 7 }))._tag, 'Stale');
			assert.strictEqual((yield* ann.remove({ id: a.id, videoId: video.id, version: 1 }))._tag, 'Updated');
			assert.strictEqual((yield* ann.remove({ id: a.id, videoId: video.id }))._tag, 'Missing');
			assert.strictEqual(yield* ann.countByVideo(video.id), 0);
		})
	);

	it.effect('the database refuses end before start', () =>
		Effect.gen(function* () {
			const { coach, video, ann } = yield* setup('a5', 6);
			const exit = yield* Effect.exit(ann.create({ videoId: video.id, authorId: coach.id, startMs: 500, endMs: 100, shape: arrow }));
			assert.strictEqual(exit._tag, 'Failure');
		})
	);
});
