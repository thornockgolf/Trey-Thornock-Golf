import { describe, expect, it } from 'vitest';
import { GRACE_DAYS, entitlementsFor, type SubscriptionFacts } from './billing';
import { describeNotification } from './notifications';

const now = new Date('2026-10-13T12:00:00Z');
const day = 86_400_000;
const sub = (over: Partial<SubscriptionFacts> = {}): SubscriptionFacts => ({ status: 'active', currentPeriodEnd: new Date(now.getTime() + 20 * day), pastDueSince: null, cancelAtPeriodEnd: false, ...over });

describe('entitlementsFor', () => {
	it('gives nothing before a payment', () => {
		expect(entitlementsFor({ assessmentPaid: false, subscription: null, now })).toMatchObject({ assessment: false, membership: false, pastDue: false });
	});
	it('the assessment unlocks uploads but not chat', () => {
		expect(entitlementsFor({ assessmentPaid: true, subscription: null, now })).toMatchObject({ assessment: true, membership: false });
	});
	it('an active or trialing membership unlocks both', () => {
		for (const status of ['active', 'trialing']) expect(entitlementsFor({ assessmentPaid: true, subscription: sub({ status }), now })).toMatchObject({ assessment: true, membership: true });
	});
	it('a membership implies the assessment even if its payment row is missing', () => {
		expect(entitlementsFor({ assessmentPaid: false, subscription: sub(), now }).assessment).toBe(true);
	});
	it('past_due keeps chat for the grace period, then stops it', () => {
		const since = new Date(now.getTime() - 2 * day);
		const inGrace = entitlementsFor({ assessmentPaid: true, subscription: sub({ status: 'past_due', pastDueSince: since }), now });
		expect(inGrace).toMatchObject({ membership: true, pastDue: true });
		expect(inGrace.graceEndsAt?.getTime()).toBe(since.getTime() + GRACE_DAYS * day);
		const over = entitlementsFor({ assessmentPaid: true, subscription: sub({ status: 'past_due', pastDueSince: new Date(now.getTime() - (GRACE_DAYS + 1) * day) }), now });
		expect(over).toMatchObject({ membership: false, pastDue: true, assessment: true });
	});
	it('a cancelled membership runs to the end of the paid period', () => {
		expect(entitlementsFor({ assessmentPaid: true, subscription: sub({ status: 'canceled' }), now }).membership).toBe(true);
		expect(entitlementsFor({ assessmentPaid: true, subscription: sub({ status: 'canceled', currentPeriodEnd: new Date(now.getTime() - day) }), now }).membership).toBe(false);
		const ending = entitlementsFor({ assessmentPaid: true, subscription: sub({ cancelAtPeriodEnd: true }), now });
		expect(ending.membership).toBe(true);
		expect(ending.endsAt).not.toBeNull();
	});
	it('incomplete and unpaid do not unlock chat', () => {
		for (const status of ['incomplete', 'incomplete_expired', 'unpaid', 'paused']) expect(entitlementsFor({ assessmentPaid: true, subscription: sub({ status }), now }).membership).toBe(false);
	});
});

describe('describeNotification', () => {
	it('links each type somewhere useful', () => {
		expect(describeNotification({ type: 'message', payload: { conversationId: 'c1', senderName: 'Sam', count: 3 } })).toEqual({ title: '3 new messages from Sam', href: '/messages/c1' });
		expect(describeNotification({ type: 'message', payload: { conversationId: 'c1', senderName: 'Sam', count: 1 } }).title).toBe('New message from Sam');
		expect(describeNotification({ type: 'video_ready', payload: { videoId: 'v1', title: 'Driver' } })).toEqual({ title: 'Driver is ready', href: '/videos/v1' });
		expect(describeNotification({ type: 'plan_assigned', payload: { planTitle: 'Short game' } })).toEqual({ title: 'New practice plan: Short game', href: '/plans' });
		expect(describeNotification({ type: 'payment_issue', payload: {} }).href).toBe('/billing');
		expect(describeNotification({ type: 'check_in_submitted', payload: { playerId: 'p1' } }).href).toBe('/coach/players/p1');
	});
	it('does not break on a type from a newer server', () => {
		expect(describeNotification({ type: 'something_new', payload: {} })).toEqual({ title: 'New notification', href: null });
	});
});
