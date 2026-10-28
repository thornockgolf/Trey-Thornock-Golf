import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import FeedbackButton from './FeedbackButton.svelte';
import { captureContext } from './feedback-client';

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

const fill = async (title: string, body: string) => {
	await fireEvent.click(screen.getByRole('button', { name: /send feedback/i }));
	await fireEvent.input(document.querySelector('[data-feedback-title]')!, { target: { value: title } });
	await fireEvent.input(document.querySelector('[data-feedback-body]')!, { target: { value: body } });
};

describe('FeedbackButton', () => {
	it('opens the sheet, files a ticket with the page, viewport and user agent, and closes', async () => {
		const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: 'x' }), { status: 200 }));
		vi.stubGlobal('fetch', fetchMock);
		render(FeedbackButton, { pagePath: '/plans?week=2', apiBase: '/api' });
		await fill('  Bigger button ', 'Make it bigger');
		await fireEvent.click(document.querySelector('[data-type="bug"]')!);
		await fireEvent.click(document.querySelector('[data-priority="high"]')!);
		await fireEvent.click(document.querySelector('[data-feedback-submit]')!);

		await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
		const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
		expect(url).toBe('/api/feedback');
		expect(init.method).toBe('POST');
		const sent = JSON.parse(init.body as string);
		expect(sent).toMatchObject({ title: 'Bigger button', body: 'Make it bigger', type: 'bug', priority: 'high', pagePath: '/plans?week=2' });
		expect(sent.viewport).toMatch(/^\d+x\d+$/);
		expect(sent.userAgent.length).toBeGreaterThan(0);
		await waitFor(() => expect(document.querySelector('dialog')!.hasAttribute('open')).toBe(false));
	});

	it('asks for a title and description before sending', async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal('fetch', fetchMock);
		render(FeedbackButton, { pagePath: '/' });
		await fireEvent.click(screen.getByRole('button', { name: /send feedback/i }));
		await fireEvent.submit(document.querySelector('dialog form')!);
		expect(document.querySelector('[data-feedback-error]')?.textContent).toMatch(/title/i);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('shows the server message and keeps the text when saving fails', async () => {
		vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ code: 'InternalError', message: 'Something went wrong' }), { status: 500 })));
		render(FeedbackButton, { pagePath: '/' });
		await fill('T', 'B');
		await fireEvent.click(document.querySelector('[data-feedback-submit]')!);
		await waitFor(() => expect(document.querySelector('[data-feedback-error]')?.textContent).toBe('Something went wrong'));
		expect((document.querySelector('[data-feedback-title]') as HTMLInputElement).value).toBe('T');
	});
});

describe('captureContext', () => {
	it('clamps to what the API accepts', () => {
		const c = captureContext('/' + 'a'.repeat(2000), { innerWidth: 390, innerHeight: 844 }, { userAgent: 'u'.repeat(2000) });
		expect(c.pagePath).toHaveLength(1000);
		expect(c.userAgent).toHaveLength(1000);
		expect(c.viewport).toBe('390x844');
	});
});
