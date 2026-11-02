import { assert, layer } from '@effect/vitest';
import { DEFAULT_OVERLAY } from '@ttg/shared';
import { Effect, Layer } from 'effect';
import { Analyses } from './analyses';
import { Segments } from './segments';
import { Db } from './db';
import { TestDb } from './testing';
import { Users } from './users';
import { Videos } from './videos';

const Live = Layer.mergeAll(Users.layer, Videos.layer, Analyses.layer, Segments.layer).pipe(Layer.provideMerge(TestDb));
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

	it.effect('finds the coach\'s newest analysis of a video, and the newest one that has a live recording', () =>
		Effect.gen(function* () {
			const { coach, video, an } = yield* setup('an4', 4);
			assert.strictEqual(yield* an.latestByCoach(video.id, coach.id), undefined);
			assert.strictEqual(yield* an.latestWithRecording(video.id), undefined);
			const first = yield* an.create({ videoId: video.id, coachId: coach.id });
			const second = yield* an.create({ videoId: video.id, coachId: coach.id });
			assert.strictEqual((yield* an.latestByCoach(video.id, coach.id))?.id, second.id);
			// an empty analysis is not something to play
			assert.strictEqual(yield* an.latestWithRecording(video.id), undefined);
			const segs = yield* Segments;
			const sid = ID(4001);
			yield* segs.createPending({ id: sid, analysisId: first.id, startMs: 0, endMs: 1000, sourceKey: 'k', annotationsAction: 'keep' });
			yield* segs.markUploaded(sid);
			yield* segs.claimForProcessing(sid);
			yield* segs.commit(sid, { clipKey: 'c', hasVideo: false });
			assert.strictEqual((yield* an.latestWithRecording(video.id))?.id, first.id);
		})
	);

	it.effect('records when the owning player opens a published analysis: first time stays, last time moves, a draft or a coach never counts', () =>
		Effect.gen(function* () {
			const users = yield* Users;
			const coach = yield* users.ensure({ clerkUserId: 'av1_c', role: 'coach' });
			const player = yield* users.ensure({ clerkUserId: 'av1_p', role: 'player' });
			const stranger = yield* users.ensure({ clerkUserId: 'av1_s', role: 'player' });
			const video = yield* (yield* Videos).create({ id: ID(61), ownerId: player.id, kind: 'swing', sourceKey: 'raw/x/source.mp4', sizeBytes: 1 });
			const an = yield* Analyses;
			const db = yield* Db;
			const a = yield* an.create({ videoId: video.id, coachId: coach.id });

			// nothing to open yet
			assert.deepStrictEqual(yield* an.viewState(video.id), { published: false, playerId: player.id, playerName: 'the player', firstViewedAt: null, lastViewedAt: null, publishedAt: null });
			assert.isUndefined(yield* an.recordView(a.id, player.id));
			assert.strictEqual((yield* an.viewState(video.id))!.firstViewedAt, null);

			// published by a live recording
			const sid = ID(6101);
			const segs = yield* Segments;
			yield* segs.createPending({ id: sid, analysisId: a.id, startMs: 0, endMs: 1000, sourceKey: 'k', annotationsAction: 'keep' });
			yield* segs.markUploaded(sid);
			yield* segs.claimForProcessing(sid);
			yield* segs.commit(sid, { clipKey: 'c', hasVideo: false });
			const unopened = (yield* an.viewState(video.id))!;
			assert.isTrue(unopened.published);
			assert.isNotNull(unopened.publishedAt);
			assert.isNull(unopened.firstViewedAt);

			// the coach and a stranger do not count
			assert.isUndefined(yield* an.recordView(a.id, coach.id));
			assert.isUndefined(yield* an.recordView(a.id, stranger.id));
			assert.isNull((yield* an.viewState(video.id))!.firstViewedAt);

			const first = yield* an.recordView(a.id, player.id);
			assert.isDefined(first);
			yield* db.query(`update analysis_views set first_viewed_at = first_viewed_at - interval '1 hour', last_viewed_at = last_viewed_at - interval '1 hour' where analysis_id = $1`, [a.id]);
			const again = yield* an.recordView(a.id, player.id);
			assert.isTrue(again!.lastViewedAt > again!.firstViewedAt); // the first open stays, the last moves
			const state = (yield* an.viewState(video.id))!;
			assert.strictEqual(state.firstViewedAt!.getTime(), again!.firstViewedAt.getTime());
			assert.strictEqual(state.lastViewedAt!.getTime(), again!.lastViewedAt.getTime());
			assert.strictEqual((yield* db.query(`select 1 from analysis_views where analysis_id = $1`, [a.id])).length, 1);

			// a re-record commits later: "opened" stays, and publishedAt moves past the last open
			const sid2 = ID(6102);
			yield* db.query(`update analysis_views set last_viewed_at = now() - interval '10 minutes' where analysis_id = $1`, [a.id]);
			yield* segs.createPending({ id: sid2, analysisId: a.id, startMs: 0, endMs: 500, sourceKey: 'k2', annotationsAction: 'keep' });
			yield* segs.markUploaded(sid2);
			yield* segs.claimForProcessing(sid2);
			yield* segs.commit(sid2, { clipKey: 'c2', hasVideo: false });
			const after = (yield* an.viewState(video.id))!;
			assert.isNotNull(after.firstViewedAt);
			assert.isTrue(after.publishedAt! > after.lastViewedAt!);
		})
	);

	it.effect('a saved comparison publishes an analysis too', () =>
		Effect.gen(function* () {
			const users = yield* Users;
			const coach = yield* users.ensure({ clerkUserId: 'av2_c', role: 'coach' });
			const player = yield* users.ensure({ clerkUserId: 'av2_p', role: 'player' });
			const video = yield* (yield* Videos).create({ id: ID(62), ownerId: player.id, kind: 'swing', sourceKey: 'raw/y/source.mp4', sizeBytes: 1 });
			const an = yield* Analyses;
			const a = yield* an.create({ videoId: video.id, coachId: coach.id });
			assert.isUndefined(yield* an.recordView(a.id, player.id));
			yield* an.setOverlay(a.id, { ...DEFAULT_OVERLAY, overlayVideoId: ID(50) });
			assert.isTrue((yield* an.viewState(video.id))!.published);
			assert.isDefined(yield* an.recordView(a.id, player.id));
			assert.isUndefined(yield* an.viewState(ID(999)));
		})
	);
});
