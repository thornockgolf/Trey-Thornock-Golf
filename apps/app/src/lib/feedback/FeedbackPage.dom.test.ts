import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import type { FeedbackDto } from '@ttg/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import FeedbackPage from './FeedbackPage.svelte';

beforeEach(() => {
	HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
		this.setAttribute('open', '');
	};
	HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
		this.removeAttribute('open');
		this.dispatchEvent(new Event('close'));
	};
});
afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

const ticket = (over: Partial<FeedbackDto> = {}): FeedbackDto => ({
	id: '11111111-1111-4111-8111-111111111111',
	authorId: 'me',
	authorName: 'Me',
	authorRole: 'player',
	title: 'Bigger button',
	body: 'Hard to tap',
	type: 'change',
	priority: 'normal',
	status: 'open',
	pagePath: '/plans',
	viewport: '390x844',
	userAgent: 'UA',
	resolutionNotes: null,
	createdAt: new Date().toISOString(),
	updatedAt: new Date().toISOString(),
	...over
});

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

/** A fetch stand-in: GET lists `tickets`; other calls go to `onWrite`. */
const stub = (tickets: FeedbackDto[], onWrite: (method: string, url: string, body: any) => Response | Promise<Response>) => {
	const f = vi.fn(async (url: string, init?: RequestInit) => {
		const method = init?.method ?? 'GET';
		if (method === 'GET') return json({ tickets });
		return onWrite(method, url, init?.body ? JSON.parse(init.body as string) : undefined);
	});
	vi.stubGlobal('fetch', f);
	return f;
};

describe('FeedbackPage actions', () => {
	it('Mark done sends status done and shows the ticket as Done with a Reopen button', async () => {
		stub([ticket()], (_m, _u, body) => json(ticket({ status: body.status })));
		render(FeedbackPage, { role: 'player', userId: 'me' });
		const btn = await screen.findByRole('button', { name: /^Mark done: Bigger button/ });
		expect(btn.className).toContain('min-h-11');
		await fireEvent.click(btn);
		await screen.findByRole('button', { name: /^Reopen: Bigger button/ });
		expect(document.querySelector('[data-status-badge]')!.textContent).toBe('Done');
		expect(document.querySelector('[data-ticket][data-done]')).not.toBeNull();
		expect(document.querySelector('[data-edit]')).toBeNull();
	});

	it('keeps the ticket as it was and shows the error when the toggle fails', async () => {
		stub([ticket()], () => json({ code: 'Conflict', message: 'The coach is handling this ticket' }, 409));
		render(FeedbackPage, { role: 'player', userId: 'me' });
		await fireEvent.click(await screen.findByRole('button', { name: /^Mark done/ }));
		await screen.findByText('The coach is handling this ticket');
		expect(document.querySelector('[data-status-badge]')!.textContent).toBe('Open');
	});

	it('gives no Mark done on a ticket in progress to a player, and no Delete on a ticket that is not theirs', async () => {
		stub([ticket({ status: 'in_progress' }), ticket({ id: '22222222-2222-4222-8222-222222222222', authorId: 'x', status: 'in_progress' })], () => json({}));
		render(FeedbackPage, { role: 'player', userId: 'me' });
		await screen.findAllByText('Bigger button');
		expect(screen.queryByRole('button', { name: /^Mark done/ })).toBeNull();
		expect(screen.getAllByRole('button', { name: /^Delete ticket/ })).toHaveLength(1);
	});

	it('asks before deleting; Keep it closes without a request and returns focus to Delete', async () => {
		const f = stub([ticket()], () => json({ ok: true }));
		render(FeedbackPage, { role: 'player', userId: 'me' });
		const del = await screen.findByRole('button', { name: /^Delete ticket: Bigger button/ });
		expect(del.className).toContain('min-h-11');
		await fireEvent.click(del);
		const dialog = document.querySelector('[data-delete-dialog]') as HTMLDialogElement;
		expect(dialog.hasAttribute('open')).toBe(true);
		expect(dialog.getAttribute('aria-labelledby')).toBe('delete-ticket-title');
		await fireEvent.click(document.querySelector('[data-keep]')!);
		expect(dialog.hasAttribute('open')).toBe(false);
		expect(document.activeElement).toBe(del);
		expect(f).toHaveBeenCalledTimes(1);
		expect(document.querySelector('[data-ticket]')).not.toBeNull();
	});

	it('Escape (the dialog close event) cancels and returns focus', async () => {
		stub([ticket()], () => json({ ok: true }));
		render(FeedbackPage, { role: 'player', userId: 'me' });
		const del = await screen.findByRole('button', { name: /^Delete ticket/ });
		await fireEvent.click(del);
		const dialog = document.querySelector('[data-delete-dialog]') as HTMLDialogElement;
		dialog.close();
		expect(document.activeElement).toBe(del);
		expect(document.querySelector('[data-ticket]')).not.toBeNull();
	});

	it('removes the card at once on confirm and sends DELETE', async () => {
		const f = stub([ticket()], () => json({ ok: true }));
		render(FeedbackPage, { role: 'player', userId: 'me' });
		await fireEvent.click(await screen.findByRole('button', { name: /^Delete ticket/ }));
		await fireEvent.click(document.querySelector('[data-confirm-delete]')!);
		await waitFor(() => expect(document.querySelector('[data-ticket]')).toBeNull());
		const call = f.mock.calls.find(([, i]) => (i as RequestInit | undefined)?.method === 'DELETE')!;
		expect(call[0]).toBe('/api/feedback/11111111-1111-4111-8111-111111111111');
	});

	it('puts the card back if the delete fails', async () => {
		stub([ticket()], () => json({ code: 'Internal', message: 'Boom' }, 500));
		render(FeedbackPage, { role: 'player', userId: 'me' });
		await fireEvent.click(await screen.findByRole('button', { name: /^Delete ticket/ }));
		await fireEvent.click(document.querySelector('[data-confirm-delete]')!);
		await waitFor(() => expect(document.querySelector('[data-ticket]')).not.toBeNull());
	});

	it('does not put the card back on a 404 (already gone)', async () => {
		stub([ticket()], () => json({ code: 'NotFound', message: 'Ticket not found' }, 404));
		render(FeedbackPage, { role: 'player', userId: 'me' });
		await fireEvent.click(await screen.findByRole('button', { name: /^Delete ticket/ }));
		await fireEvent.click(document.querySelector('[data-confirm-delete]')!);
		await new Promise((r) => setTimeout(r, 20));
		expect(document.querySelector('[data-ticket]')).toBeNull();
	});

	it('a coach can delete any ticket', async () => {
		stub([ticket({ authorId: 'someone' })], () => json({ ok: true }));
		render(FeedbackPage, { role: 'coach', userId: 'coach' });
		expect(await screen.findByRole('button', { name: /^Delete ticket/ })).toBeTruthy();
	});
});
