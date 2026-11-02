// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import type { PlanSessionDto } from '@ttg/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PlansHarness from './PlansHarness.svelte';

vi.mock('#lib/toaster', () => ({ toaster: { error: vi.fn() } }));
import { toaster } from '#lib/toaster';

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	vi.clearAllMocks();
});

const session = (id: string, scheduledOn: string, title: string, done = false): PlanSessionDto => ({
	id,
	assignmentId: 'a',
	title,
	planTitle: 'Plan',
	scheduledOn,
	durationMin: 30,
	items: [{ id: `${id}-i`, drillId: `drill-${id}`, name: `Drill of ${title}`, minutes: 30, completedAt: done ? '2026-10-01T10:00:00.000Z' : null }],
	completedAt: done ? '2026-10-01T10:00:00.000Z' : null,
	tags: []
});
const sessions = [session('s-oct28', '2026-10-28', 'Oct 28 plan'), session('s-nov2', '2026-11-02', 'Nov 2 plan'), session('s-nov4', '2026-11-04', 'Nov 4 plan'), session('s-oct25', '2026-10-25', 'Oct 25 plan', true)];

const mount = (favorites = { sessionIds: [] as string[], drillIds: [] as string[] }, fetchImpl?: typeof fetch) => {
	const fetchMock = vi.fn(fetchImpl ?? (async () => new Response('{}', { status: 200 })));
	vi.stubGlobal('fetch', fetchMock);
	render(PlansHarness, { sessions, today: '2026-11-02', favorites });
	return fetchMock;
};
const headings = () => screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent?.trim());

describe('History and ordering', () => {
	it('lists today and later at the top and moves earlier sessions into a collapsed History at the bottom', () => {
		mount();
		const history = document.querySelector('details[data-history]') as HTMLDetailsElement;
		expect(history.open).toBe(false);
		expect(within(history).getByText('(2)')).toBeTruthy();
		expect(within(history).getByText(/Earlier sessions, most recent first. 1 not finished/)).toBeTruthy();
		// Document order: Nov 2, Nov 4, then (inside History) Oct 28, Oct 25.
		expect(headings().filter((h) => h?.includes('plan'))).toEqual(['Nov 2 plan', 'Nov 4 plan', 'Oct 28 plan', 'Oct 25 plan']);
		expect(history.contains(screen.getByText('Oct 28 plan'))).toBe(true);
		expect(history.contains(screen.getByText('Nov 2 plan'))).toBe(false);
		// History is the last block on the page.
		expect(history.parentElement!.lastElementChild).toBe(history);
	});

	it('says an unfinished earlier session can still be checked off', () => {
		mount();
		const card = screen.getByText('Oct 28 plan').closest('article')!;
		expect(within(card).getByText(/This one was not finished. You can still check drills off./)).toBeTruthy();
		expect(within(card).getByRole('checkbox', { name: /Mark Drill of Oct 28 plan done/ })).toBeTruthy();
	});

	it('has no History section when nothing is in the past', () => {
		cleanup();
		render(PlansHarness, { sessions: [sessions[1]!], today: '2026-11-02', favorites: { sessionIds: [], drillIds: [] } });
		expect(document.querySelector('details[data-history]')).toBeNull();
	});
});

describe('Star toggles', () => {
	it('flips a session star at once, calls PUT, and DELETE when pressed again', async () => {
		const fetchMock = mount();
		const star = screen.getByRole('button', { name: 'Favorite Nov 2 plan' });
		expect(star.getAttribute('aria-pressed')).toBe('false');
		await fireEvent.click(star);
		expect(star.getAttribute('aria-pressed')).toBe('true');
		await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/favorites/session/s-nov2', { method: 'PUT' }));
		await fireEvent.click(star);
		expect(star.getAttribute('aria-pressed')).toBe('false');
		await waitFor(() => expect(fetchMock).toHaveBeenLastCalledWith('/api/favorites/session/s-nov2', { method: 'DELETE' }));
	});

	it('stars a drill, and rolls back with an error toast when the server refuses', async () => {
		let answer!: () => void;
		const fetchMock = mount(undefined, () => new Promise<Response>((resolve) => (answer = () => resolve(new Response('{}', { status: 500 })))));
		const star = screen.getByRole('button', { name: 'Favorite Drill of Nov 2 plan' });
		await fireEvent.click(star);
		expect(star.getAttribute('aria-pressed')).toBe('true'); // optimistic, before the server answers
		answer();
		await waitFor(() => expect(star.getAttribute('aria-pressed')).toBe('false'));
		expect(fetchMock).toHaveBeenCalledWith('/api/favorites/drill/drill-s-nov2', { method: 'PUT' });
		expect(toaster.error).toHaveBeenCalledTimes(1);
	});

	it('rolls back when the network fails', async () => {
		mount(undefined, async () => {
			throw new TypeError('offline');
		});
		const star = screen.getByRole('button', { name: 'Favorite Nov 4 plan' });
		await fireEvent.click(star);
		await waitFor(() => expect(star.getAttribute('aria-pressed')).toBe('false'));
		expect(toaster.error).toHaveBeenCalled();
	});

	it('toggles from the keyboard (a real button: Enter and Space click it)', async () => {
		mount();
		const star = screen.getByRole('button', { name: 'Favorite Nov 4 plan' });
		expect(star.tagName).toBe('BUTTON');
		expect(star.getAttribute('type')).toBe('button');
		expect(star.className).toContain('size-11');
	});
});

describe('Favorites section', () => {
	it('is absent with no favorites', () => {
		mount();
		expect(document.querySelector('[data-favorites]')).toBeNull();
	});

	it('lists starred sessions (past ones too, and also in History) and starred drills with their session', () => {
		mount({ sessionIds: ['s-oct28', 's-nov4'], drillIds: ['drill-s-nov2'] });
		const fav = document.querySelector('[data-favorites]') as HTMLElement;
		expect(within(fav).getByRole('heading', { name: /Favorites/ }).textContent).toContain('(3)');
		const sessionRows = [...fav.querySelectorAll('[data-favorite-session]')].map((r) => r.getAttribute('data-favorite-session'));
		expect(sessionRows).toEqual(['s-nov4', 's-oct28']);
		const drill = fav.querySelector('[data-favorite-drill]') as HTMLElement;
		expect(within(drill).getByText('Drill of Nov 2 plan')).toBeTruthy();
		expect(within(drill).getByText(/30 min/)).toBeTruthy();
		expect(within(drill).getByText(/In Nov 2 plan/)).toBeTruthy();
		// The past favorite is still a card in History (one chosen behaviour: listed in both).
		expect(document.querySelector('details[data-history]')!.contains(screen.getByText('Oct 28 plan', { selector: 'h3' }))).toBe(true);
		// Favorites sit above History.
		expect(fav.compareDocumentPosition(document.querySelector('details[data-history]')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
	});

	it('unstarring from the section removes the row at once', async () => {
		mount({ sessionIds: ['s-nov4'], drillIds: [] });
		const fav = document.querySelector('[data-favorites]') as HTMLElement;
		await fireEvent.click(within(fav).getByRole('button', { name: 'Favorite Nov 4 plan' }));
		expect(document.querySelector('[data-favorites]')).toBeNull();
	});

	it('Show opens History around a past favorite and focuses its card', async () => {
		mount({ sessionIds: ['s-oct28'], drillIds: [] });
		window.HTMLElement.prototype.scrollIntoView = vi.fn();
		const history = document.querySelector('details[data-history]') as HTMLDetailsElement;
		expect(history.open).toBe(false);
		await fireEvent.click(screen.getByRole('button', { name: /Show Oct 28 plan in the page/ }));
		expect(history.open).toBe(true);
		expect(document.activeElement?.id).toBe('session-s-oct28');
	});
});
