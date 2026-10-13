import { Accounts } from '@ttg/db';
import { Effect } from 'effect';
import { Storage } from './storage';

export type AccountDeleteOutcome =
	| { readonly _tag: 'Deleted'; readonly files: number }
	| { readonly _tag: 'AlreadyDeleted' }
	| { readonly _tag: 'NotRequested' };

/**
 * Close a player's account (job `account.delete`). A job for an account whose deletion was never requested does
 * nothing, so a stray job cannot erase anyone. Otherwise files first, then rows: the keys come from the rows, so a
 * crash or an R2 error leaves the rows in place and the retry finds the same keys (deleting a missing object
 * succeeds). Once every file is gone the rows are erased in one transaction.
 */
export const deleteAccount = (userId: string): Effect.Effect<AccountDeleteOutcome, unknown, Accounts | Storage> =>
	Effect.gen(function* () {
		const accounts = yield* Accounts;
		const storage = yield* Storage;
		const status = yield* accounts.status(userId);
		if (status === 'Erased') return { _tag: 'AlreadyDeleted' } as const;
		if (status !== 'Pending') return { _tag: 'NotRequested' } as const;
		const keys = yield* accounts.objectKeys(userId);
		yield* Effect.forEach(keys, (key) => storage.deleteAccountObject(key), { concurrency: 4, discard: true });
		yield* accounts.erase(userId);
		return { _tag: 'Deleted', files: keys.length } as const;
	});
