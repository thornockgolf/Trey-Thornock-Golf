import type { BillingDto } from '@ttg/shared';
import { describe, expect, it } from 'vitest';
import { awaitingConfirmation, billingView, formatMoney } from './billing-view';

const base = (over: Partial<BillingDto> = {}, e: Partial<BillingDto['entitlements']> = {}): BillingDto => ({
	assessmentPaid: false,
	subscription: null,
	entitlements: { assessment: false, membership: false, pastDue: false, graceEndsAt: null, endsAt: null, ...e },
	payments: [],
	canManage: false,
	...over
});
const now = new Date('2026-10-13T12:00:00Z');

describe('billingView', () => {
	it('leads with the assessment for a new player', () => {
		expect(billingView(base(), now).stage).toBe('new');
	});
	it('offers the membership once the assessment is paid', () => {
		expect(billingView(base({ assessmentPaid: true }, { assessment: true }), now).stage).toBe('assessment_paid');
	});
	it('shows an active membership with its renewal date', () => {
		const v = billingView(base({ subscription: { status: 'active', currentPeriodEnd: '2026-11-13T00:00:00Z', cancelAtPeriodEnd: false } }, { assessment: true, membership: true }), now);
		expect(v.stage).toBe('member');
		expect(v.note).toMatch(/Renews on/);
	});
	it('warns about a failed payment, with the date chat stops, and after the grace period says messaging is paused', () => {
		const sub = { status: 'past_due', currentPeriodEnd: null, cancelAtPeriodEnd: false };
		const during = billingView(base({ subscription: sub }, { assessment: true, membership: true, pastDue: true, graceEndsAt: '2026-10-18T00:00:00Z' }), now);
		expect(during).toMatchObject({ stage: 'past_due' });
		expect(during.note).toMatch(/Update your card by/);
		expect(billingView(base({ subscription: sub }, { assessment: true, membership: false, pastDue: true }), now).note).toMatch(/paused/);
	});
	it('says when a cancelled membership ends, and when it already has', () => {
		const sub = { status: 'active', currentPeriodEnd: '2026-10-30T00:00:00Z', cancelAtPeriodEnd: true };
		expect(billingView(base({ subscription: sub }, { assessment: true, membership: true, endsAt: '2026-10-30T00:00:00Z' }), now).stage).toBe('ending');
		expect(billingView(base({ subscription: { ...sub, status: 'canceled' } }, { assessment: true, membership: false, endsAt: '2026-10-01T00:00:00Z' }), now).stage).toBe('lapsed');
	});
});

describe('awaitingConfirmation', () => {
	it('only waits on the success redirect while nothing has changed yet', () => {
		const before = { assessment: false, membership: false };
		expect(awaitingConfirmation('success', base(), before)).toBe(true);
		expect(awaitingConfirmation('success', base({}, { assessment: true }), before)).toBe(false);
		expect(awaitingConfirmation('cancelled', base(), before)).toBe(false);
		expect(awaitingConfirmation(null, base(), before)).toBe(false);
	});
});

describe('formatMoney', () => {
	it('formats cents', () => {
		expect(formatMoney(14900, 'usd')).toBe('$149.00');
	});
});
