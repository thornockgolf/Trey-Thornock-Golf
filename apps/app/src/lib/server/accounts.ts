import { Accounts, Queue } from '@ttg/db';
import { DeletePlayerRequest, PRESIGN_PUT_TTL_S } from '@ttg/shared';
import { Effect } from 'effect';
import { requireRole } from './auth';
import { ClerkAdmin } from './clerk-admin';
import { decodeBody } from './decode';
import { NotFound } from './errors';
import { playerIdParam } from './players';
import { StripeApi } from './stripe';

/** The worker waits this long, so a presigned upload still in flight (15 minutes) lands before the files are listed. */
export const DELETE_AFTER_SECONDS = PRESIGN_PUT_TTL_S + 60;

/**
 * `POST /api/players/:id/delete`: permanently delete a player's account. Coach only; the body must be `{ confirm: true }`.
 * In order: lock the account (the player vanishes from the coach's list and can no longer use the app), delete the
 * Stripe customer (cancels the subscription), delete the Clerk user (ends the sessions), then queue `account.delete`,
 * where the worker removes the files and rows and scrubs the user. Payments stay for accounting. A failure before the
 * job is queued leaves the account locked and tells the coach to try again; every step is safe to repeat.
 */
export const deletePlayer = Effect.gen(function* () {
	yield* requireRole('coach');
	yield* decodeBody(DeletePlayerRequest);
	const userId = yield* playerIdParam;
	const target = yield* (yield* Accounts).requestDeletion(userId);
	if (!target) return yield* new NotFound({ message: 'Player not found' });
	if (target.deleted) return { ok: true };
	if (target.stripeCustomerId) yield* (yield* StripeApi).deleteCustomer(target.stripeCustomerId);
	yield* (yield* ClerkAdmin).deleteUser(target.clerkUserId);
	yield* (yield* Queue).send('account.delete', { user_id: userId }, { startAfterSeconds: DELETE_AFTER_SECONDS });
	return { ok: true };
});
