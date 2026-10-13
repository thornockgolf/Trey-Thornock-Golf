import { Accounts, Db, Users, Videos } from '@ttg/db';
import { TestDb } from '@ttg/db/testing';
import { keys } from '@ttg/shared';
import { Effect, Layer, ManagedRuntime } from 'effect';
import { afterAll, describe, expect, it } from 'vitest';
import { deleteAccount } from './process-account-delete';
import { Storage } from './storage';

const mem = Storage.makeMemory();
const rt = ManagedRuntime.make(
	Layer.mergeAll(mem.layer).pipe(Layer.provideMerge(Layer.mergeAll(Users.layer, Videos.layer, Accounts.layer).pipe(Layer.provideMerge(TestDb))))
);
afterAll(() => rt.dispose());

const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const put = (key: string) => mem.objects.set(key, { body: new Uint8Array(3), contentType: 'video/mp4' });

describe('deleteAccount', () => {
	it('deletes the player\'s files and rows only after deletion was requested, and nobody else\'s', async () => {
		const out = await rt.runPromise(
			Effect.gen(function* () {
				const users = yield* Users;
				const videos = yield* Videos;
				const db = yield* Db;
				const accounts = yield* Accounts;
				const player = yield* users.ensure({ clerkUserId: 'del_player', role: 'player' });
				const other = yield* users.ensure({ clerkUserId: 'del_other', role: 'player' });
				for (const [n, owner] of [[1, player.id], [2, other.id]] as const) {
					yield* videos.create({ id: ID(n), ownerId: owner, kind: 'swing', sourceKey: keys.rawSource(ID(n), 'mp4'), sizeBytes: 3 });
					yield* db.query(`update videos set processed_key = $2 where id = $1`, [ID(n), keys.processedVideo(ID(n))]);
					put(keys.rawSource(ID(n), 'mp4'));
					put(keys.processedVideo(ID(n)));
				}
				put(keys.spriteVtt(ID(1)));

				const stray = yield* deleteAccount(player.id); // never requested: files must survive
				const survivors = mem.objects.size;
				yield* accounts.requestDeletion(player.id);
				const first = yield* deleteAccount(player.id);
				const again = yield* deleteAccount(player.id);
				return { stray, survivors, first, again, remaining: [...mem.objects.keys()].sort(), rows: yield* videos.listByOwner(other.id) };
			})
		);
		expect(out.stray).toEqual({ _tag: 'NotRequested' });
		expect(out.survivors).toBe(5);
		expect(out.first).toEqual({ _tag: 'Deleted', files: 3 });
		expect(out.again).toEqual({ _tag: 'AlreadyDeleted' });
		expect(out.remaining).toEqual([keys.processedVideo(ID(2)), keys.rawSource(ID(2), 'mp4')].sort());
		expect(out.rows).toHaveLength(1);
	});

	it('refuses to delete keys outside a player\'s prefixes', async () => {
		const exit = await rt.runPromiseExit(Effect.flatMap(Effect.service(Storage), (s) => s.deleteAccountObject('../etc/passwd')));
		expect(exit._tag).toBe('Failure');
		const other = await rt.runPromiseExit(Effect.flatMap(Effect.service(Storage), (s) => s.deleteAccountObject('exports/x.csv')));
		expect(other._tag).toBe('Failure');
	});
});
