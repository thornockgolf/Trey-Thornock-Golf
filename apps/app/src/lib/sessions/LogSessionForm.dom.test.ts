import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CheckInForm from '#lib/calendar/CheckInForm.svelte';
import { toaster } from '#lib/toaster';
import LogSessionForm from './LogSessionForm.svelte';

const errorToast = vi.spyOn(toaster, 'error');
beforeEach(() => {
	errorToast.mockClear();
	Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

const found = (sel: string) =>
	waitFor(() => {
		const el = document.querySelector<HTMLElement>(sel);
		expect(el).not.toBeNull();
		return el!;
	});
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
const saveButton = () => document.querySelector<HTMLButtonElement>('[data-save]')!;
const submit = () => fireEvent.click(saveButton());

describe('LogSessionForm: no silent failures', () => {
	it('an empty log sends nothing, shows the message, toasts, scrolls to it and focuses it', async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal('fetch', fetchMock);
		render(LogSessionForm, { drills: [], onsaved: vi.fn() });
		await submit();
		const alert = await found('[data-form-error]');
		expect(alert.textContent).toContain('Pick at least one');
		expect(alert.getAttribute('role')).toBe('alert');
		await waitFor(() => expect(document.activeElement).toBe(alert));
		expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
		expect(errorToast).toHaveBeenCalledWith(expect.objectContaining({ description: expect.stringContaining('Pick at least one') }));
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('with a tag it posts the minimal body and reports the save', async () => {
		const fetchMock = vi.fn(async () => json(200, { id: 'x', date: '2026-11-02', tags: ['skill'] }));
		vi.stubGlobal('fetch', fetchMock);
		const onsaved = vi.fn();
		render(LogSessionForm, { drills: [], onsaved });
		await fireEvent.click(document.querySelector('[data-tag-button="skill"]')!);
		await submit();
		await waitFor(() => expect(onsaved).toHaveBeenCalledTimes(1));
		const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
		expect(url).toBe('/api/logged-sessions');
		expect(init.method).toBe('POST');
		expect(JSON.parse(init.body as string)).toEqual({ date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), tags: ['skill'] });
		expect(errorToast).not.toHaveBeenCalled();
	});

	it('typed minutes (through the real input binding) post as a number', async () => {
		const fetchMock = vi.fn(async () => json(200, { id: 'x' }));
		vi.stubGlobal('fetch', fetchMock);
		const onsaved = vi.fn();
		render(LogSessionForm, { drills: [], onsaved });
		const user = userEvent.setup();
		await user.type(document.querySelector<HTMLInputElement>('[data-minutes]')!, '45');
		await user.click(document.querySelector('[data-tag-button="skill"]')!);
		await user.click(screen.getByRole('button', { name: 'Save session' }));
		await waitFor(() => expect(onsaved).toHaveBeenCalledTimes(1));
		expect(JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string).minutes).toBe(45);
		expect(errorToast).not.toHaveBeenCalled();
	});

	it('blank minutes post without minutes', async () => {
		const fetchMock = vi.fn(async () => json(200, { id: 'x' }));
		vi.stubGlobal('fetch', fetchMock);
		const onsaved = vi.fn();
		render(LogSessionForm, { drills: [], onsaved });
		const user = userEvent.setup();
		await user.click(document.querySelector('[data-tag-button="skill"]')!);
		await user.click(screen.getByRole('button', { name: 'Save session' }));
		await waitFor(() => expect(onsaved).toHaveBeenCalledTimes(1));
		expect(JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)).not.toHaveProperty('minutes');
	});

	it('0 and 700 minutes show a visible error and send nothing', async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal('fetch', fetchMock);
		render(LogSessionForm, { drills: [], onsaved: vi.fn() });
		const user = userEvent.setup();
		await user.click(document.querySelector('[data-tag-button="skill"]')!);
		const input = document.querySelector<HTMLInputElement>('[data-minutes]')!;
		for (const bad of ['0', '700']) {
			await user.clear(input);
			await user.type(input, bad);
			await user.click(screen.getByRole('button', { name: 'Save session' }));
			expect((await found('[data-form-error]')).textContent).toContain('whole number');
		}
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('an unexpected exception is shown and logged, never silent', async () => {
		const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
		vi.stubGlobal('fetch', vi.fn(async () => json(200, { id: 'x' })));
		const onsaved = vi.fn(() => {
			throw new Error('boom');
		});
		render(LogSessionForm, { drills: [], onsaved });
		await fireEvent.click(document.querySelector('[data-tag-button="skill"]')!);
		await submit();
		expect((await found('[data-form-error]')).textContent).toContain('Please try again');
		expect(errorToast).toHaveBeenCalled();
		expect(spy).toHaveBeenCalled();
		spy.mockRestore();
	});

	it('text only (no tags) also posts', async () => {
		const fetchMock = vi.fn(async () => json(200, { id: 'x' }));
		vi.stubGlobal('fetch', fetchMock);
		const onsaved = vi.fn();
		render(LogSessionForm, { drills: [], onsaved });
		await fireEvent.input(document.querySelector('[data-worked-on]')!, { target: { value: 'Putting' } });
		await submit();
		await waitFor(() => expect(onsaved).toHaveBeenCalled());
		expect(JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)).toMatchObject({ workedOn: 'Putting' });
	});

	it('a server refusal (a coach, 403) is shown inline and as a toast, and Save works again', async () => {
		vi.stubGlobal('fetch', vi.fn(async () => json(403, { code: 'Forbidden', message: 'Only players can log sessions' })));
		const onsaved = vi.fn();
		render(LogSessionForm, { drills: [], onsaved });
		await fireEvent.click(document.querySelector('[data-tag-button="skill"]')!);
		await submit();
		const alert = await found('[data-form-error]');
		expect(alert.textContent).toContain('Only players');
		expect(errorToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Session not saved' }));
		expect(onsaved).not.toHaveBeenCalled();
		expect(saveButton().disabled).toBe(false);
	});

	it('a network failure is shown too', async () => {
		vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))));
		render(LogSessionForm, { drills: [], onsaved: vi.fn() });
		await fireEvent.click(document.querySelector('[data-tag-button="skill"]')!);
		await submit();
		const alert = await found('[data-form-error]');
		expect(alert.textContent).toContain('Check your connection');
		expect(errorToast).toHaveBeenCalled();
	});
});

describe('CheckInForm: no silent failures', () => {
	it('asks for a confidence rating visibly, without sending', async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal('fetch', fetchMock);
		render(CheckInForm, { date: '2026-11-02', videos: [], onSubmitted: vi.fn() });
		await fireEvent.click(document.querySelector('[data-checkin-submit]')!);
		const alert = await found('[data-checkin-error]');
		expect(alert.textContent).toContain('confident');
		await waitFor(() => expect(document.activeElement).toBe(alert));
		expect(errorToast).toHaveBeenCalled();
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('typed rounds post as a number; blank rounds post 0; 31 is refused visibly', async () => {
		const fetchMock = vi.fn(async () => json(200, { id: 'c' }));
		vi.stubGlobal('fetch', fetchMock);
		const onSubmitted = vi.fn();
		render(CheckInForm, { date: '2026-11-02', videos: [], onSubmitted });
		const user = userEvent.setup();
		const rounds = document.querySelector<HTMLInputElement>('[data-rounds]')!;
		await user.click(document.querySelector('[data-confidence="4"]')!);
		await user.clear(rounds);
		await user.type(rounds, '31');
		await user.click(document.querySelector('[data-checkin-submit]')!);
		expect((await found('[data-checkin-error]')).textContent).toContain('whole number');
		expect(fetchMock).not.toHaveBeenCalled();
		await user.clear(rounds);
		await user.type(rounds, '3');
		await user.click(document.querySelector('[data-checkin-submit]')!);
		await waitFor(() => expect(onSubmitted).toHaveBeenCalledTimes(1));
		const body = () => JSON.parse((fetchMock.mock.calls.at(-1) as unknown as [string, RequestInit])[1].body as string);
		expect(body().answers.roundsPlayed).toBe(3);
		await user.clear(rounds);
		await user.click(document.querySelector('[data-checkin-submit]')!);
		await waitFor(() => expect(onSubmitted).toHaveBeenCalledTimes(2));
		expect(body().answers.roundsPlayed).toBe(0);
	});

	it('shows a payment refusal with the billing link, and toasts', async () => {
		vi.stubGlobal('fetch', vi.fn(async () => json(402, { code: 'PaymentRequired', message: 'Start your assessment first', billingUrl: '/billing' })));
		render(CheckInForm, { date: '2026-11-02', videos: [], onSubmitted: vi.fn() });
		await fireEvent.click(document.querySelector('[data-confidence="4"]')!);
		await fireEvent.click(document.querySelector('[data-checkin-submit]')!);
		const alert = await found('[data-checkin-error]');
		expect(alert.textContent).toContain('Start your assessment');
		expect(alert.querySelector('[data-billing-link]')).not.toBeNull();
		expect(errorToast).toHaveBeenCalled();
	});
});
