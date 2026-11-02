import { cleanup, render, waitFor } from '@testing-library/svelte';
import type { AnalysisViewDto } from '@ttg/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AnalysisOpened from './AnalysisOpened.svelte';

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

const view = (over: Partial<AnalysisViewDto>): AnalysisViewDto => ({ state: 'unopened', playerName: 'Sam Rivera', firstViewedAt: null, lastViewedAt: null, updatedSinceOpened: false, ...over });
const text = () => document.querySelector('[data-analysis-view]')?.textContent?.trim();

describe('AnalysisOpened', () => {
	it('says Not opened yet, Opened by <player> <time>, and when it was updated since', () => {
		render(AnalysisOpened, { videoId: 'v1', view: view({}), pollMs: 1_000_000 });
		expect(text()).toBe('Not opened yet');
		cleanup();
		render(AnalysisOpened, { videoId: 'v1', view: view({ state: 'opened', firstViewedAt: new Date().toISOString(), lastViewedAt: new Date().toISOString() }), pollMs: 1_000_000 });
		expect(text()).toMatch(/^Opened by Sam Rivera \d{1,2}:\d{2}/);
		expect(document.querySelector('[data-analysis-view]')?.getAttribute('data-state')).toBe('opened');
		cleanup();
		render(AnalysisOpened, { videoId: 'v1', view: view({ state: 'opened', firstViewedAt: new Date().toISOString(), lastViewedAt: new Date().toISOString(), updatedSinceOpened: true }), pollMs: 1_000_000 });
		expect(text()).toMatch(/Updated since$/);
		cleanup();
		render(AnalysisOpened, { videoId: 'v1', view: view({ state: 'unpublished' }), pollMs: 1_000_000 });
		expect(text()).toMatch(/^Not shared yet/);
	});

	it('shows nothing without a view, and refreshes itself while the tab is shown', async () => {
		render(AnalysisOpened, { videoId: 'v1', view: null, pollMs: 1_000_000 });
		expect(text()).toBeUndefined();
		cleanup();
		const now = new Date().toISOString();
		const fetchFn = vi.fn(async () => new Response(JSON.stringify(view({ state: 'opened', firstViewedAt: now, lastViewedAt: now })), { status: 200 }));
		vi.stubGlobal('fetch', fetchFn);
		render(AnalysisOpened, { videoId: 'v1', view: view({}), pollMs: 20 });
		expect(text()).toBe('Not opened yet');
		await waitFor(() => expect(text()).toMatch(/^Opened by Sam Rivera/));
		expect(fetchFn).toHaveBeenCalledWith('/api/videos/v1/analysis-view', expect.anything());
	});
});
