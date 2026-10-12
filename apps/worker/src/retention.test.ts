import { Db, Queue, Users, Videos } from '@ttg/db';
import { TestDb } from '@ttg/db/testing';
import { MAX_VIDEO_BYTES, keys } from '@ttg/shared';
import { Effect, Layer, ManagedRuntime } from 'effect';
import { afterAll, describe, expect, it } from 'vitest';
import { sweepAbandonedUploads } from './retention';
import { Storage } from './storage';

const mem = Storage.makeMemory();
const sent: string[] = [];
const FakeQueue = Layer.succeed(
	Queue,
	Queue.of({ send: (_n, p) => Effect.sync(() => (sent.push((p as { video_id: string }).video_id), 'job')), work: () => Effect.void })
);
const rt = ManagedRuntime.make(
	Layer.mergeAll(mem.layer, FakeQueue).pipe(Layer.provideMerge(Layer.mergeAll(Users.layer, Videos.layer).pipe(Layer.provideMerge(TestDb))))
);
afterAll(() => rt.dispose());

const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

describe('sweepAbandonedUploads', () => {
	it('promotes finished-but-uncompleted uploads, deletes rows with no object, fails invalid ones, leaves recent and processed rows', async () => {
		const result = await rt.runPromise(
			Effect.gen(function* () {
				const users = yield* Users;
				const videos = yield* Videos;
				const db = yield* Db;
				const owner = yield* users.ensure({ clerkUserId: 'ret_owner', role: 'player' });
				const mk = (n: number) => videos.create({ id: ID(n), ownerId: owner.id, kind: 'swing', sourceKey: keys.rawSource(ID(n), 'mp4'), sizeBytes: 10 });
				for (const n of [1, 2, 3, 4, 5]) yield* mk(n);
				// 1: object landed, /complete never called. 2: nothing uploaded. 3: recent. 4: oversize object. 5: already uploaded.
				mem.objects.set(keys.rawSource(ID(1), 'mp4'), { body: new Uint8Array(500), contentType: 'video/mp4' });
				mem.objects.set(keys.rawSource(ID(4), 'mp4'), { body: { length: MAX_VIDEO_BYTES + 1 } as Uint8Array, contentType: 'video/mp4' });
				yield* videos.markUploaded(ID(5), 1);
				yield* db.query(`alter table videos disable trigger videos_updated_at`);
				yield* db.query(`update videos set created_at = now() - interval '2 days' where id <> $1`, [ID(3)]);
				yield* db.query(`alter table videos enable trigger videos_updated_at`);
				const r = yield* sweepAbandonedUploads;
				return { r, one: yield* videos.find(ID(1)), two: yield* videos.find(ID(2)), three: yield* videos.find(ID(3)), four: yield* videos.find(ID(4)), five: yield* videos.find(ID(5)) };
			})
		);
		expect(result.r).toEqual({ deleted: 1, promoted: 1, failed: 1, skipped: 0 });
		expect(result.one).toMatchObject({ status: 'uploaded', sizeBytes: 500 });
		expect(result.two).toBeUndefined();
		expect(result.three?.status).toBe('pending');
		expect(result.four).toMatchObject({ status: 'failed', errorCode: 'INVALID_UPLOAD' });
		expect(result.five?.status).toBe('uploaded');
		expect(sent).toEqual([ID(1)]);
		// no object was deleted or written
		expect(mem.log).toEqual([]);
		expect(mem.objects.has(keys.rawSource(ID(4), 'mp4'))).toBe(true);
	});
});
