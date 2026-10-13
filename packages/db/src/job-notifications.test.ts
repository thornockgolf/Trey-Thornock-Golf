import { assert, layer } from '@effect/vitest';
import { Effect, Layer } from 'effect';
import { Analyses } from './analyses';
import { Annotations } from './annotations';
import { Notifications } from './notifications';
import { Segments } from './segments';
import { TestDb } from './testing';
import { Users } from './users';
import { Videos } from './videos';

const Live = Layer.mergeAll(Users.layer, Videos.layer, Analyses.layer, Annotations.layer, Segments.layer, Notifications.layer).pipe(Layer.provideMerge(TestDb));
const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const out = { processedKey: 'p', thumbnailKey: 't', spriteKey: 's', durationMs: 1000, fps: 30, width: 1, height: 1 };

layer(Live, { timeout: 60_000 })('notifications written by jobs', (it) => {
	it.effect('video_ready and video_failed go to the owner once, even when the job retries', () =>
		Effect.gen(function* () {
			const owner = yield* (yield* Users).ensure({ clerkUserId: 'jn1', role: 'player' });
			const videos = yield* Videos;
			const n = yield* Notifications;
			yield* videos.create({ id: ID(1), ownerId: owner.id, kind: 'swing', title: 'Driver', sourceKey: 'raw/a', sizeBytes: 1 });
			yield* videos.create({ id: ID(2), ownerId: owner.id, kind: 'swing', sourceKey: 'raw/b', sizeBytes: 1 });
			const first = yield* videos.markReady(ID(1), out);
			assert.strictEqual(first?.type, 'video_ready');
			assert.deepStrictEqual([first?.userId, first?.payload.videoId, first?.payload.title], [owner.id, ID(1), 'Driver']);
			assert.isUndefined(yield* videos.markReady(ID(1), out));
			assert.strictEqual((yield* videos.markFailed(ID(2), 'INVALID_VIDEO'))?.type, 'video_failed');
			assert.isUndefined(yield* videos.markFailed(ID(2), 'INVALID_VIDEO'));
			assert.deepStrictEqual((yield* n.list(owner.id)).map((x) => x.type).sort(), ['video_failed', 'video_ready']);
		})
	);

	it.effect('analysis_ready tells the video owner once per analysis, and never the coach about their own video', () =>
		Effect.gen(function* () {
			const users = yield* Users;
			const coach = yield* users.ensure({ clerkUserId: 'jn2_c', role: 'coach' });
			const player = yield* users.ensure({ clerkUserId: 'jn2_p', role: 'player' });
			const videos = yield* Videos;
			const segs = yield* Segments;
			const notes = yield* Notifications;
			yield* videos.create({ id: ID(10), ownerId: player.id, kind: 'swing', title: 'Irons', sourceKey: 'raw/c', sizeBytes: 1 });
			yield* videos.create({ id: ID(11), ownerId: coach.id, kind: 'swing', sourceKey: 'raw/d', sizeBytes: 1 });
			const record = (analysisId: string, n: number, start: number, end: number) =>
				Effect.gen(function* () {
					const id = ID(n);
					yield* segs.createPending({ id, analysisId, startMs: start, endMs: end, sourceKey: 'k', annotationsAction: 'keep' });
					yield* segs.markUploaded(id);
					yield* segs.claimForProcessing(id);
					return yield* segs.commit(id, { clipKey: `c${n}`, hasVideo: false });
				});
			const analyses = yield* Analyses;
			const a = yield* analyses.create({ videoId: ID(10), coachId: coach.id });
			const first = yield* record(a.id, 100, 0, 5000);
			assert.strictEqual(first?.notification?.type, 'analysis_ready');
			assert.strictEqual(first?.notification?.userId, player.id);
			assert.deepStrictEqual([first?.notification?.payload.videoId, first?.notification?.payload.title], [ID(10), 'Irons']);
			assert.isUndefined((yield* record(a.id, 101, 5000, 8000))?.notification);
			assert.strictEqual((yield* notes.list(player.id)).filter((x) => x.type === 'analysis_ready').length, 1);
			const own = yield* analyses.create({ videoId: ID(11), coachId: coach.id });
			assert.isUndefined((yield* record(own.id, 102, 0, 5000))?.notification);
		})
	);
});
