import { Schema } from 'effect';

/** Payments (spec 3.E.2). Payment state is written only by the Stripe webhook handler. */

export const PRODUCTS = ['assessment', 'membership'] as const;
export type Product = (typeof PRODUCTS)[number];

/** `POST /api/billing/checkout`. */
export const CheckoutRequest = Schema.Struct({ product: Schema.Literals(PRODUCTS) });
export type CheckoutRequest = typeof CheckoutRequest.Type;

/** After a failed renewal the player keeps chat for this long, then it is blocked until the payment is fixed. */
export const GRACE_DAYS = 7;

export interface SubscriptionFacts {
	readonly status: string;
	readonly currentPeriodEnd: Date | null;
	readonly pastDueSince: Date | null;
	readonly cancelAtPeriodEnd: boolean;
}

export interface Entitlements {
	/** Paid the assessment, or has (had) a membership, which is only offered after it. Unlocks the questionnaire and uploads. */
	readonly assessment: boolean;
	/** Unlocks chat and check-ins: an active or trialing membership, or past_due inside the grace period. */
	readonly membership: boolean;
	readonly pastDue: boolean;
	/** Only while past_due: when chat stops working. */
	readonly graceEndsAt: Date | null;
	/** The membership ends at the period end (cancelled in the Portal). */
	readonly endsAt: Date | null;
}

const DAY = 86_400_000;

/** What a player may use, from rows written by the webhook. Pure: `now` is passed in. */
export const entitlementsFor = (input: {
	readonly assessmentPaid: boolean;
	readonly subscription: SubscriptionFacts | null;
	readonly now: Date;
}): Entitlements => {
	const s = input.subscription;
	const ongoing = s !== null && (s.status === 'active' || s.status === 'trialing');
	const pastDue = s !== null && s.status === 'past_due';
	const graceEndsAt = pastDue ? new Date((s!.pastDueSince ?? input.now).getTime() + GRACE_DAYS * DAY) : null;
	const inGrace = pastDue && graceEndsAt !== null && input.now < graceEndsAt;
	// A cancelled subscription still runs to the end of the period the player paid for.
	const cancelledButPaid = s !== null && s.status === 'canceled' && s.currentPeriodEnd !== null && input.now < s.currentPeriodEnd;
	const everSubscribed = s !== null;
	return {
		assessment: input.assessmentPaid || everSubscribed,
		membership: ongoing || inGrace || cancelledButPaid,
		pastDue,
		graceEndsAt,
		endsAt: s !== null && (s.cancelAtPeriodEnd || s.status === 'canceled') ? s.currentPeriodEnd : null
	};
};

export interface BillingDto {
	readonly assessmentPaid: boolean;
	readonly subscription: { readonly status: string; readonly currentPeriodEnd: string | null; readonly cancelAtPeriodEnd: boolean } | null;
	readonly entitlements: { readonly assessment: boolean; readonly membership: boolean; readonly pastDue: boolean; readonly graceEndsAt: string | null; readonly endsAt: string | null };
	readonly payments: readonly { readonly id: string; readonly kind: string; readonly amountCents: number; readonly currency: string; readonly status: string; readonly paidAt: string | null }[];
	/** Prices are not in code (they live in Stripe); these are only for display on the billing page. */
	readonly canManage: boolean;
}
