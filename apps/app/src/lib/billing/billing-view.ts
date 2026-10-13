import type { BillingDto } from '@ttg/shared';

export interface BillingView {
	/** Which headline and action the page leads with. */
	stage: 'new' | 'assessment_paid' | 'member' | 'past_due' | 'ending' | 'lapsed';
	title: string;
	note: string;
}

/** What the player should see first, from the state Postgres holds (never from the URL). */
export const billingView = (b: BillingDto, now: Date = new Date()): BillingView => {
	const e = b.entitlements;
	const date = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' }) : null);
	if (e.pastDue)
		return {
			stage: 'past_due',
			title: 'Your last payment failed',
			note: e.membership ? `Update your card${e.graceEndsAt ? ` by ${date(e.graceEndsAt)}` : ''} to keep messaging your coach.` : 'Messaging is paused until the payment is fixed. Your videos, plans and history are safe.'
		};
	if (e.membership && e.endsAt && new Date(e.endsAt) > now)
		return { stage: 'ending', title: 'Your membership ends soon', note: `You keep full access until ${date(e.endsAt)}. You can resume it from the billing portal.` };
	if (e.membership) return { stage: 'member', title: 'Coaching membership active', note: b.subscription?.currentPeriodEnd ? `Renews on ${date(b.subscription.currentPeriodEnd)}.` : 'Thanks for training with Trey.' };
	if (b.subscription) return { stage: 'lapsed', title: 'Your membership has ended', note: 'You can rejoin any time. Your history stays in your account.' };
	if (e.assessment) return { stage: 'assessment_paid', title: 'Assessment paid', note: 'Upload your swing and fill in the questionnaire. Join the membership to keep working with Trey after your assessment.' };
	return { stage: 'new', title: 'Start with the Initial Performance Assessment', note: 'A one-time assessment of your swing, with a plan from Trey. The coaching membership follows it.' };
};

export const formatMoney = (cents: number, currency: string) => new Intl.NumberFormat('en-US', { style: 'currency', currency: currency.toUpperCase() }).format(cents / 100);

export const paymentLabel = (kind: string) => (kind === 'assessment' ? 'Initial Performance Assessment' : 'Coaching membership');

/** `?checkout=success` and whether the page should keep checking: the webhook may be a few seconds behind the redirect. */
export const awaitingConfirmation = (checkout: string | null, b: BillingDto, before: { assessment: boolean; membership: boolean }) =>
	checkout === 'success' && b.entitlements.assessment === before.assessment && b.entitlements.membership === before.membership;
