import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import type { BillingDto } from '@ttg/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import BillingPage from './BillingPage.svelte';

// jsdom has no showModal/close on <dialog>: stand-ins that set `open`.
beforeEach(() => {
	HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
		this.setAttribute('open', '');
	};
	HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
		this.removeAttribute('open');
	};
});
afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

const END = new Date(Date.now() + 20 * 86_400_000).toISOString();
const dto = (cancelAtPeriodEnd: boolean, over: Partial<BillingDto['subscription'] & object> = {}): BillingDto => ({
	assessmentPaid: true,
	subscription: { status: 'active', currentPeriodEnd: END, cancelAtPeriodEnd, ...over },
	entitlements: { assessment: true, membership: true, pastDue: false, graceEndsAt: null, endsAt: cancelAtPeriodEnd ? END : null },
	payments: [],
	canManage: true
});
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe('cancel and resume on the billing page', () => {
	it('shows the renewal date and, once confirmed, a request-received state until the webhook has landed', async () => {
		let stored = false;
		let polls = 0;
		const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
			if (url.endsWith('/billing/cancel') && init?.method === 'POST') return json({ accepted: true, action: 'cancel', alreadyApplied: false, endsAt: END });
			if (url.endsWith('/billing')) return json(dto(++polls >= 2 ? (stored = true) : false));
			return json({}, 404);
		});
		vi.stubGlobal('fetch', fetchMock);
		render(BillingPage, { billing: dto(false), apiBase: '/api', pollMs: 5, settleMs: 2000 });
		expect(document.querySelector('[data-membership-dates]')!.textContent).toMatch(/Renews on/);

		await fireEvent.click(document.querySelector('[data-cancel]')!);
		const dialog = document.querySelector('[data-cancel-dialog]')!;
		expect(dialog.hasAttribute('open')).toBe(true);
		expect(dialog.textContent).toMatch(/You keep chat and check-ins until/);
		expect(dialog.textContent).toMatch(/won't be charged again/);
		expect(fetchMock).not.toHaveBeenCalled(); // nothing happens before the confirm

		await fireEvent.click(document.querySelector('[data-confirm-cancel]')!);
		await waitFor(() => expect(document.querySelector('[data-change-pending="cancel"]')).not.toBeNull());
		expect(dialog.hasAttribute('open')).toBe(false);
		expect(document.querySelector('[data-change-pending]')!.textContent).toMatch(/request was received/);
		expect(document.querySelector('[data-change-pending]')!.textContent).not.toMatch(/cancelled/i);

		await waitFor(() => expect(stored).toBe(true));
		await waitFor(() => expect(document.querySelector('[data-change-pending]')).toBeNull());
		expect(document.querySelector('[data-membership-dates]')!.textContent).toMatch(/Ends on .*You keep chat and check-ins until then/);
		expect(document.querySelector('[data-resume]')).not.toBeNull();
		expect(document.querySelector('[data-cancel]')).toBeNull();
	});

	it('"Keep my membership" closes the dialog and sends nothing', async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal('fetch', fetchMock);
		render(BillingPage, { billing: dto(false) });
		await fireEvent.click(document.querySelector('[data-cancel]')!);
		await fireEvent.click(document.querySelector('[data-keep]')!);
		expect(document.querySelector('[data-cancel-dialog]')!.hasAttribute('open')).toBe(false);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('says the request was received (not cancelled) when the webhook is slow', async () => {
		vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => (init?.method === 'POST' ? json({ accepted: true, action: 'cancel', alreadyApplied: false, endsAt: END }) : json(dto(false)))));
		render(BillingPage, { billing: dto(false), pollMs: 5, settleMs: 40 });
		await fireEvent.click(document.querySelector('[data-cancel]')!);
		await fireEvent.click(document.querySelector('[data-confirm-cancel]')!);
		await waitFor(() => expect(document.querySelector('[data-change-pending]')!.textContent).toMatch(/Your request was received; this page will update shortly/));
	});

	it('resumes from the ending state', async () => {
		const fetchMock = vi.fn(async (url: string, init?: RequestInit) => (init?.method === 'POST' ? json({ accepted: true, action: 'resume', alreadyApplied: false, endsAt: END }) : json(dto(false))));
		vi.stubGlobal('fetch', fetchMock);
		render(BillingPage, { billing: dto(true), pollMs: 5 });
		await fireEvent.click(document.querySelector('[data-resume]')!);
		expect(fetchMock.mock.calls[0]![0]).toBe('/api/billing/resume');
		await waitFor(() => expect(document.querySelector('[data-cancel]')).not.toBeNull());
		expect(document.querySelector('[data-membership-dates]')!.textContent).toMatch(/Renews on/);
	});

	it('shows a visible error and changes nothing when the request fails', async () => {
		vi.stubGlobal('fetch', vi.fn(async () => json({ code: 'PaymentError', message: 'We could not reach Stripe. Nothing was changed.' }, 402)));
		render(BillingPage, { billing: dto(false) });
		await fireEvent.click(document.querySelector('[data-cancel]')!);
		await fireEvent.click(document.querySelector('[data-confirm-cancel]')!);
		await waitFor(() => expect(document.querySelector('[data-change-error]')!.textContent).toMatch(/Nothing was changed/));
		expect(document.querySelector('[data-change-pending]')).toBeNull();
		expect(document.querySelector('[data-cancel]')).not.toBeNull();
	});

	it('offers no cancel without a membership', () => {
		render(BillingPage, { billing: { ...dto(false), subscription: null, entitlements: { assessment: true, membership: false, pastDue: false, graceEndsAt: null, endsAt: null } } });
		expect(document.querySelector('[data-cancel]')).toBeNull();
		expect(document.querySelector('[data-buy-membership]')).not.toBeNull();
		expect(screen.queryByText('Cancel membership')).toBeNull();
	});
});
