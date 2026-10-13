import { Billing } from '@ttg/db';
import type { CurrentUserData } from '@ttg/shared';
import { Effect } from 'effect';
import { PaymentError } from './errors';

const BILLING_URL = '/billing';

/**
 * What a player has paid for (spec 3.E.2): the assessment unlocks the questionnaire and uploads;
 * the membership unlocks chat and check-ins. Coaches are never gated. Everything is read from rows
 * the Stripe webhook wrote, never from anything the browser says.
 */
export const requireAssessment = (user: CurrentUserData) =>
	Effect.gen(function* () {
		if (user.role === 'coach') return;
		if (!(yield* (yield* Billing).entitlements(user.id)).assessment)
			return yield* new PaymentError({ message: 'Start with the Initial Performance Assessment to unlock this', billingUrl: BILLING_URL });
	});

export const requireMembership = (user: CurrentUserData) =>
	Effect.gen(function* () {
		if (user.role === 'coach') return;
		const e = yield* (yield* Billing).entitlements(user.id);
		if (e.membership) return;
		return yield* new PaymentError({
			message: e.pastDue ? 'Your last payment failed. Update your card to keep messaging your coach' : 'An active coaching membership is needed for this',
			billingUrl: BILLING_URL
		});
	});
