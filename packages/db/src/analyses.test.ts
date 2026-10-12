import { assert, layer } from '@effect/vitest';
import { DEFAULT_OVERLAY } from '@ttg/shared';
import { Effect, Layer } from 'effect';
import { Analyses } from './analyses';
import { Db } from './db';
import { TestDb } from './testing';
import { Users } from './users';
import { Videos } from './videos';

const Live = Layer.mergeAll(Users.layer, Videos.layer, Analyses.layer).pipe(Layer.provideMerge(TestDb));
const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

layer(Live, { timeout: 60_000 })('Analyses', (it) => {
	const setup = (clerk: string, n: number) =>
		Effect.gen(function* () {
			const users = yield* Users;
			const coach = yield* users.ensure({ clerkUserId: `${clerk}_c`, role: 'coach' });
			const video = yield* (yield* Videos).create({ id: ID(n), ownerId: coach.id, kind: 'swing', sourceKey: `raw/${ID(n)}/source.mp4`, sizeBytes: 1 });
			return { coach, video, an: yield* Analyses };
		});

	it.effect('creates with default overlay settings and finds it', () =>
		Effect.gen(function* () {
			const { coach, video, an } = yield* setup('an1', 1);
			const a = yield* an.create({ videoId: video.id, coachId: coach.id, title: 'Driver review' });
			assert.deepStrictEqual(a.overlay, DEFAULT_OVERLAY);
			assert.strictEqual((yield* an.find(a.id))?.title, 'Driver review');
			assert.strictEqual(yield* an.find(ID(999)), undefined);
		})
	);

	it.effect('stores and reads back overlay settings, and only an analysis with an overlay video is "latest"', () =>
		Effect.gen(function* () {
			const { coach, video, an } = yield* setup('an2', 2);
			const plain = yield* an.create({ videoId: video.id, coachId: coach.id });
			assert.strictEqual(yield* an.latestWithOverlay(video.id), undefined);
			const settings = { ...DEFAULT_OVERLAY, overlayVideoId: ID(50), opacity: 0.3, scale: 1.5, x: 0.1, baseSyncMs: 1200, overlaySyncMs: 800 };
			const saved = yield* an.setOverlay(plain.id, settings);
			assert.deepStrictEqual(saved?.overlay, settings);
			assert.strictEqual((yield* an.latestWithOverlay(video.id))?.id, plain.id);
			assert.strictEqual(yield* an.setOverlay(ID(998), settings), undefined);
		})
	);

	it.effect('invalid stored JSON reads as the defaults instead of failing', () =>
		Effect.gen(function* () {
			const { coach, video, an } = yield* setup('an3', 3);
			const a = yield* an.create({ videoId: video.id, coachId: coach.id });
			yield* (yield* Db).query(`update analyses set overlay_settings = '{"opacity": 99}' where id = $1`, [a.id]);
			assert.deepStrictEqual((yield* an.find(a.id))?.overlay, DEFAULT_OVERLAY);
		})
	);
});
