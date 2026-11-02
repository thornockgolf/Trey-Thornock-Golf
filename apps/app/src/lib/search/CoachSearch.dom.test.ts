import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import type { SearchResponse } from '@ttg/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CoachSearch from './CoachSearch.svelte';

const RESPONSE: SearchResponse = {
	q: 'tempo',
	categories: [
		{ kind: 'player', label: 'Players', more: false, results: [{ kind: 'player', id: 'p1', title: 'Sam Rivera', subtitle: 'sam@example.com', snippet: null, href: '/coach/players/p1' }] },
		{
			kind: 'message',
			label: 'Messages',
			more: true,
			results: [
				{ kind: 'message', id: 'm1', title: 'Sam Rivera', subtitle: 'Messages', snippet: '…my transition tempo is rushed…', href: '/messages/c1' },
				{ kind: 'message', id: 'm2', title: 'Sam Rivera', subtitle: 'In video: Range', snippet: 'tempo here?', href: '/videos/v1' }
			]
		}
	]
};

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
	Element.prototype.scrollIntoView = vi.fn();
	vi.useFakeTimers({ shouldAdvanceTime: true });
	fetchMock = vi.fn(async () => new Response(JSON.stringify(RESPONSE), { status: 200 }));
	vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
	cleanup();
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

const type = async (text: string) => {
	const box = screen.getByRole('combobox');
	await fireEvent.input(box, { target: { value: text } });
	await vi.advanceTimersByTimeAsync(400);
	return box;
};

describe('CoachSearch', () => {
	it('debounces typing into one request and groups results by category with headings', async () => {
		render(CoachSearch, { go: vi.fn() });
		const box = screen.getByRole('combobox');
		for (const t of ['te', 'tem', 'tempo']) await fireEvent.input(box, { target: { value: t } });
		await vi.advanceTimersByTimeAsync(400);
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(fetchMock.mock.calls[0]![0]).toBe('/api/search?q=tempo');
		await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(3));
		expect(screen.getByRole('group', { name: 'Players' })).toBeTruthy();
		expect(screen.getByRole('group', { name: 'Messages' })).toBeTruthy();
		expect(screen.getByText(/More matches/)).toBeTruthy();
		// the match is highlighted in the snippet
		expect(document.querySelector('mark')?.textContent).toBe('tempo');
		// screen readers get a count
		expect(screen.getByRole('status').textContent).toBe('3 results in 2 categories');
	});

	it('does not search for fewer than two characters and says so', async () => {
		render(CoachSearch, { go: vi.fn() });
		await type('t');
		expect(fetchMock).not.toHaveBeenCalled();
		expect(screen.getByText(/at least 2 characters/i)).toBeTruthy();
	});

	it('moves with the arrow keys, wraps, and opens the active result with Enter', async () => {
		const go = vi.fn();
		render(CoachSearch, { go });
		const box = await type('tempo');
		await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(3));
		expect(box.getAttribute('aria-activedescendant')).toBe('search-opt-0');
		await fireEvent.keyDown(box, { key: 'ArrowDown' });
		await fireEvent.keyDown(box, { key: 'ArrowDown' });
		expect(screen.getAllByRole('option')[2]!.getAttribute('aria-selected')).toBe('true');
		await fireEvent.keyDown(box, { key: 'ArrowDown' });
		expect(box.getAttribute('aria-activedescendant')).toBe('search-opt-0');
		await fireEvent.keyDown(box, { key: 'ArrowUp' });
		await fireEvent.keyDown(box, { key: 'Enter' });
		expect(go).toHaveBeenCalledWith('/videos/v1');
	});

	it('opens a result on click and closes the panel', async () => {
		const go = vi.fn();
		render(CoachSearch, { go });
		await type('tempo');
		await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(3));
		await fireEvent.click(screen.getAllByRole('option')[0]!);
		expect(go).toHaveBeenCalledWith('/coach/players/p1');
		expect(screen.queryByRole('listbox')).toBeNull();
	});

	it('Escape clears the text, then closes', async () => {
		render(CoachSearch, { go: vi.fn() });
		const box = (await type('tempo')) as HTMLInputElement;
		await waitFor(() => expect(screen.getByRole('listbox')).toBeTruthy());
		await fireEvent.keyDown(box, { key: 'Escape' });
		expect(screen.queryByRole('listbox')).toBeNull();
	});

	it('/ and Ctrl+K focus the search from anywhere except a text field', async () => {
		render(CoachSearch, { go: vi.fn() });
		const box = screen.getByRole('combobox');
		await fireEvent.keyDown(document.body, { key: '/' });
		await waitFor(() => expect(document.activeElement).toBe(box));
		(box as HTMLInputElement).blur();
		await fireEvent.keyDown(document.body, { key: 'k', ctrlKey: true });
		await waitFor(() => expect(document.activeElement).toBe(box));
		// typing a slash into the box itself is just text
		const ev = new KeyboardEvent('keydown', { key: '/', bubbles: true, cancelable: true });
		box.dispatchEvent(ev);
		expect(ev.defaultPrevented).toBe(false);
	});

	it('shows an empty state and an error state with a retry', async () => {
		fetchMock.mockImplementationOnce(async () => new Response(JSON.stringify({ q: 'zzz', categories: [] }), { status: 200 }));
		render(CoachSearch, { go: vi.fn() });
		await type('zzz');
		await waitFor(() => expect(screen.getByText(/No matches for/)).toBeTruthy());
		expect(screen.getByRole('status').textContent).toBe('No results for zzz');
		fetchMock.mockImplementationOnce(async () => new Response('{}', { status: 500 }));
		await type('boom');
		await waitFor(() => expect(screen.getByText(/Search did not work/)).toBeTruthy());
		await fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
		await vi.advanceTimersByTimeAsync(400);
		await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(3));
	});
});
