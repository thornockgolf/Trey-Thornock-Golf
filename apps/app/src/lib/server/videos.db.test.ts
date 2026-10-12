import { Db, Queue, Users, Videos } from '@ttg/db';
import { TestDb } from '@ttg/db/testing';
import { MAX_VIDEO_BYTES, MULTIPART_THRESHOLD_BYTES, PART_SIZE_BYTES, keys } from '@ttg/shared';
import { Effect, Layer, ManagedRuntime } from 'effect';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { CoachAllowlist } from './auth';
import { makeFakeR2 } from './r2-fake';
import { makeRunRoute } from './run-route';
import { fakeEvent } from './test-utils';
import {
	abortMultipart,
	completeMultipart,
	completeVideo,
	createVideo,
	downloadVideo,
	listMyVideos,
	listParts,
	playbackVideo,
	signPart
} from './videos';

// Integration: real Users/Videos on a throwaway migrated database (needs `docker compose up -d db`),
// in-memory R2 and queue.
const r2 = makeFakeR2();
const sent: { name: string; payload: unknown }[] = [];
const FakeQueue = Layer.succeed(
	Queue,
	Queue.of({
		send: (name, payload) => Effect.sync(() => (sent.push({ name, payload }), 'job-1')),
		work: () => Effect.void
	})
);
const Dbs = TestDb;
const Services = Layer.mergeAll(Users.layer, Videos.layer).pipe(Layer.provideMerge(Dbs));
const rt = ManagedRuntime.make(
	Layer.mergeAll(CoachAllowlist.layerFromCsv('coach_a,coach_b'), r2.layer, FakeQueue).pipe(Layer.provideMerge(Services))
);
const run = makeRunRoute(rt);
afterAll(() => rt.dispose());

const post = (userId: string | null, body: unknown, params: Record<string, string> = {}, query = '') =>
	fakeEvent({ userId, body, params, query });
const call = async <A, E>(effect: Effect.Effect<A, E, never> | Effect.Effect<A, E, any>, event: ReturnType<typeof fakeEvent>) => {
	const res = await run(event, effect as never);
	return { status: res.status, body: (await res.json()) as any };
};

const create = async (user: string, size = 1_000_000, contentType = 'video/mp4') =>
	call(createVideo, post(user, { contentType, sizeBytes: size }));
const seedObject = (key: string, sizeBytes: number) => r2.objects.set(key, { sizeBytes, contentType: 'video/mp4' });
const setReady = (id: string) =>
	rt.runPromise(
		Effect.gen(function* () {
			const v = yield* Videos;
			yield* v.markUploaded(id, 1000);
			yield* v.claimForProcessing(id);
			yield* v.markReady(id, {
				processedKey: keys.processedVideo(id), thumbnailKey: keys.poster(id), spriteKey: keys.sprite(id),
				durationMs: 4000, fps: 30, width: 1280, height: 720
			});
		})
	);
const assign = (coachClerk: string, playerClerk: string, status = 'active') =>
	rt.runPromise(
		Effect.gen(function* () {
			const users = yield* Users;
			const db = yield* Db;
			const c = yield* users.ensure({ clerkUserId: coachClerk, role: 'coach' });
			const p = yield* users.ensure({ clerkUserId: playerClerk, role: 'player' });
			yield* db.query(
				`insert into coach_assignments (coach_id, player_id, status) values ($1, $2, $3)
				 on conflict (coach_id, player_id) do update set status = excluded.status`,
				[c.id, p.id, status]
			);
		})
	);

beforeEach(() => {
	sent.length = 0;
});

describe('POST /api/videos', () => {
	it('rejects anonymous callers', async () => {
		expect((await create(null as never)).status).toBe(401);
	});

	it.each([
		['a non-video type', 1000, 'application/pdf'],
		['an empty file', 0, 'video/mp4'],
		['a file over the limit', MAX_VIDEO_BYTES + 1, 'video/mp4'],
		['a fractional size', 10.5, 'video/mp4']
	])('422 for %s', async (_n, size, type) => {
		const r = await create('pl_a', size, type);
		expect(r.status).toBe(422);
		expect(r.body.code).toBe('ValidationError');
	});

	it('small file: pending row owned by the caller and a presigned PUT for the fixed key', async () => {
		const r = await call(createVideo, post('pl_a', { contentType: 'video/quicktime', sizeBytes: 5_000_000, title: ' Driver ' }));
		expect(r.status).toBe(200);
		expect(r.body.video).toMatchObject({ status: 'pending', kind: 'swing', title: 'Driver', sizeBytes: 5_000_000 });
		expect(r.body.upload.mode).toBe('single');
		expect(r.body.upload.url).toContain(`raw/${r.body.video.id}/source.mov`);
		expect(r.body.upload.headers).toEqual({ 'Content-Type': 'video/quicktime' });
		expect(JSON.stringify(r.body)).not.toContain('source_key');
	});

	it('large file: starts a multipart upload with the part size', async () => {
		const r = await create('pl_a', MULTIPART_THRESHOLD_BYTES);
		expect(r.body.upload).toMatchObject({ mode: 'multipart', partSizeBytes: PART_SIZE_BYTES });
		expect(r.body.upload.uploadId).toBeTruthy();
	});

	it('a coach can upload their own swing too', async () => {
		expect((await create('coach_a')).status).toBe(200);
	});
});

describe('cross-user access to upload endpoints', () => {
	it('player B gets 403 on every owner-only call for player A video; unknown ids are 404', async () => {
		const a = await create('pl_a', MULTIPART_THRESHOLD_BYTES);
		const params = { id: a.body.video.id };
		const uploadId = a.body.upload.uploadId;
		const calls = [
			call(signPart({ uploadId, partNumber: 1 }), post('pl_b', {}, params)),
			call(listParts, post('pl_b', undefined, params, `?uploadId=${uploadId}`)),
			call(completeMultipart({ uploadId, parts: [{ partNumber: 1, etag: 'x' }] }), post('pl_b', {}, params)),
			call(abortMultipart(uploadId), post('pl_b', {}, params)),
			call(completeVideo, post('pl_b', undefined, params))
		];
		for (const r of await Promise.all(calls)) expect(r.status).toBe(403);
		// even an assigned coach cannot act on the owner's upload
		await assign('coach_a', 'pl_a');
		expect((await call(completeVideo, post('coach_a', undefined, params))).status).toBe(403);
		expect((await call(completeVideo, post('pl_a', undefined, { id: crypto.randomUUID() }))).status).toBe(404);
		expect((await call(completeVideo, post('pl_a', undefined, { id: 'not-a-uuid' }))).status).toBe(404);
	});
});

describe('multipart upload', () => {
	it('sign, resume via listParts, complete, then /complete', async () => {
		const a = await create('pl_mp', MULTIPART_THRESHOLD_BYTES + 1);
		const id = a.body.video.id;
		const { uploadId } = a.body.upload;
		const params = { id };
		const sign = await call(signPart({ uploadId, partNumber: 2 }), post('pl_mp', { uploadId, partNumber: 2 }, params));
		expect(sign.body.url).toContain(`partNumber=2`);
		const e1 = r2.uploadPart(uploadId, 1, PART_SIZE_BYTES);
		const e2 = r2.uploadPart(uploadId, 2, 123);
		const listed = await call(listParts, post('pl_mp', undefined, params, `?uploadId=${uploadId}`));
		expect(listed.body.parts.map((p: any) => p.partNumber)).toEqual([1, 2]);
		const done = await call(
			completeMultipart({ uploadId, parts: [{ partNumber: 1, etag: e1 }, { partNumber: 2, etag: e2 }] }),
			post('pl_mp', {}, params)
		);
		expect(done.status).toBe(200);
		const fin = await call(completeVideo, post('pl_mp', undefined, params));
		expect(fin.body.status).toBe('uploaded');
		expect(sent).toEqual([{ name: 'video.uploaded', payload: { video_id: id } }]);
	});

	it('missing uploadId is a 422; abort frees the upload', async () => {
		const a = await create('pl_mp2', MULTIPART_THRESHOLD_BYTES);
		const params = { id: a.body.video.id };
		expect((await call(listParts, post('pl_mp2', undefined, params))).status).toBe(422);
		const uploadId = a.body.upload.uploadId;
		expect((await call(abortMultipart(uploadId), post('pl_mp2', {}, params))).status).toBe(200);
		expect(r2.uploads.has(uploadId)).toBe(false);
	});
});

describe('POST /api/videos/:id/complete', () => {
	it('409 and nothing queued when the object is not in R2', async () => {
		const a = await create('pl_c');
		const r = await call(completeVideo, post('pl_c', undefined, { id: a.body.video.id }));
		expect(r.status).toBe(409);
		expect(sent).toHaveLength(0);
		const list = await call(listMyVideos, fakeEvent({ userId: 'pl_c' }));
		expect(list.body.videos[0].status).toBe('pending');
	});

	it('409 when the stored object is bigger than the limit', async () => {
		const a = await create('pl_c2');
		seedObject(keys.rawSource(a.body.video.id, 'mp4'), MAX_VIDEO_BYTES + 1);
		expect((await call(completeVideo, post('pl_c2', undefined, { id: a.body.video.id }))).status).toBe(409);
		expect(sent).toHaveLength(0);
	});

	it('marks uploaded with the real size, queues once; a repeat after processing queues nothing', async () => {
		const a = await create('pl_c3');
		const id = a.body.video.id;
		seedObject(keys.rawSource(id, 'mp4'), 777);
		const ok = await call(completeVideo, post('pl_c3', undefined, { id }));
		expect(ok.body).toMatchObject({ status: 'uploaded', sizeBytes: 777 });
		expect(sent).toHaveLength(1);
		await rt.runPromise(Effect.gen(function* () { return yield* (yield* Videos).claimForProcessing(id); }));
		const again = await call(completeVideo, post('pl_c3', undefined, { id }));
		expect(again.body.status).toBe('processing');
		expect(sent).toHaveLength(1);
	});
});

describe('GET /api/videos', () => {
	it('lists only my videos, with a signed poster for ready ones', async () => {
		const a = await create('pl_l');
		await create('pl_other');
		await setReady(a.body.video.id);
		const list = await call(listMyVideos, fakeEvent({ userId: 'pl_l' }));
		expect(list.body.videos).toHaveLength(1);
		expect(list.body.videos[0].posterUrl).toContain(keys.poster(a.body.video.id));
	});
});

describe('playback and download: the 403 matrix', () => {
	let id: string;
	beforeEach(async () => {
		const a = await create('pl_owner');
		id = a.body.video.id;
		await setReady(id);
	});
	const get = (user: string | null, effect: Effect.Effect<any, any, any>, query = '') =>
		call(effect, fakeEvent({ userId: user, params: { id }, query }));

	it('owner gets playback and both downloads', async () => {
		const p = await get('pl_owner', playbackVideo);
		expect(p.status).toBe(200);
		expect(p.body.url).toContain(keys.processedVideo(id));
		expect(p.body.spriteVttUrl).toContain(keys.spriteVtt(id));
		const proc = await get('pl_owner', downloadVideo, '?variant=processed');
		expect(proc.body.url).toContain(keys.processedVideo(id));
		expect(proc.body.url).toContain('download=');
		const orig = await get('pl_owner', downloadVideo, '?variant=original');
		expect(orig.body.url).toContain(keys.rawSource(id, 'mp4'));
		expect(orig.body.filename).toMatch(/-original\.mp4$/);
	});

	it('another player is 403 and no URL leaks', async () => {
		for (const effect of [playbackVideo, downloadVideo]) {
			const r = await get('pl_stranger', effect);
			expect(r.status).toBe(403);
			expect(JSON.stringify(r.body)).not.toContain('r2.test');
		}
	});

	it('an unassigned coach is 403; an assigned coach is allowed; an ended assignment is 403 again', async () => {
		expect((await get('coach_b', playbackVideo)).status).toBe(403);
		expect((await get('coach_b', downloadVideo, '?variant=original')).status).toBe(403);
		await assign('coach_b', 'pl_owner');
		expect((await get('coach_b', playbackVideo)).status).toBe(200);
		expect((await get('coach_b', downloadVideo, '?variant=original')).status).toBe(200);
		await assign('coach_b', 'pl_owner', 'ended');
		expect((await get('coach_b', playbackVideo)).status).toBe(403);
	});

	it('a coach assigned to a different player is 403', async () => {
		await assign('coach_a', 'pl_someone_else');
		expect((await get('coach_a', playbackVideo)).status).toBe(403);
	});

	it('anonymous is 401; bad variant is 422; a not-ready video is 409', async () => {
		expect((await get(null, playbackVideo)).status).toBe(401);
		expect((await get('pl_owner', downloadVideo, '?variant=hd')).status).toBe(422);
		const fresh = await create('pl_owner');
		const r = await call(playbackVideo, fakeEvent({ userId: 'pl_owner', params: { id: fresh.body.video.id } }));
		expect(r.status).toBe(409);
	});
});
