// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/svelte';
import type { HomeDto, PhaseState } from '@ttg/shared';
import { afterEach, describe, expect, it } from 'vitest';
import HomePage from './HomePage.svelte';

afterEach(cleanup);

const phase = (id: string, title: string, from: number, to: number, state: PhaseState) => ({
	id,
	title,
	description: `${title} description`,
	measure: state === 'current' ? 'Measured on video' : null,
	fromLesson: from,
	toLesson: to,
	state
});
const assignment = { id: 'a', planTitle: 'Rebuild', startsOn: '2026-09-01' };
const phases = [phase('p1', 'Setup', 1, 6, 'done'), phase('p2', 'Backswing', 7, 18, 'current'), phase('p3', 'Impact', 19, 30, 'upcoming')];
const lessonHome = (isToday: boolean): HomeDto => ({
	assignment,
	lesson: {
		number: 8,
		total: 30,
		completedCount: 7,
		isToday,
		session: {
			id: 's',
			assignmentId: 'a',
			title: 'Wide takeaway',
			planTitle: 'Rebuild',
			scheduledOn: '2026-10-28',
			durationMin: 45,
			completedAt: null,
			items: [
				{ id: 'i1', drillId: 'd1', name: 'Towel drill', minutes: 10, completedAt: '2026-10-28T10:00:00Z' },
				{ id: 'i2', drillId: 'd2', name: 'Pump drill', minutes: 15, completedAt: null }
			]
		}
	},
	phases,
	currentPhaseId: 'p2',
	today: '2026-10-28'
});

describe('HomePage', () => {
	it('shows today\'s lesson in the hero', () => {
		render(HomePage, { home: lessonHome(true) });
		expect(screen.getByRole('heading', { name: 'What are we doing today?' })).toBeTruthy();
		expect(screen.getByText('Lesson 8 of 30')).toBeTruthy();
		expect(screen.getByRole('progressbar', { name: 'Lessons completed' }).getAttribute('aria-valuenow')).toBe('7');
		expect(screen.getByText('Wide takeaway')).toBeTruthy();
		expect(screen.getByText('45 min · 2 drills')).toBeTruthy();
		const done = screen.getByText('Towel drill').closest('li')!;
		expect(done.dataset.done).toBe('true');
		expect(within(done).getByText('Done')).toBeTruthy();
		expect((screen.getByText('Pump drill').closest('li') as HTMLElement).dataset.done).toBe('false');
		const start = screen.getByRole('link', { name: 'Continue session' });
		expect(start.getAttribute('href')).toBe('/plans');
	});

	it('says "Up next" when the lesson is not today', () => {
		render(HomePage, { home: lessonHome(false) });
		expect(screen.getByRole('heading', { name: 'Up next' })).toBeTruthy();
		expect(screen.queryByText('What are we doing today?')).toBeNull();
	});

	it('shows a finished state when every lesson is done', () => {
		render(HomePage, { home: { ...lessonHome(true), lesson: null } });
		expect(screen.getByRole('heading', { name: 'Plan complete' })).toBeTruthy();
		expect(screen.getByRole('link', { name: 'Message Trey' }).getAttribute('href')).toBe('/messages');
		expect(screen.queryByRole('progressbar')).toBeNull();
	});

	it('shows an empty state with no plan and hides the roadmap', () => {
		render(HomePage, { home: { assignment: null, lesson: null, phases: [], currentPhaseId: null, today: '2026-10-28' } });
		expect(screen.getByText("Your coach hasn't assigned a plan yet")).toBeTruthy();
		expect(screen.getByRole('link', { name: 'Message Trey' }).getAttribute('href')).toBe('/messages');
		expect(screen.queryByText('Your roadmap')).toBeNull();
	});

	it('renders phases by state', () => {
		render(HomePage, { home: lessonHome(true) });
		const items = screen.getAllByRole('listitem').filter((li) => li.dataset.state);
		expect(items.map((li) => li.dataset.state)).toEqual(['done', 'current', 'upcoming']);
		const current = items[1]!;
		expect(current.getAttribute('aria-current')).toBe('step');
		expect(within(current).getByText('You are here')).toBeTruthy();
		expect(within(current).getByText('Lessons 7-18')).toBeTruthy();
		expect(within(current).getByText('Backswing description')).toBeTruthy();
		expect(within(current).getByText(/Measured on video/)).toBeTruthy();
		expect(within(items[0]!).queryByText('Setup description')).toBeNull();
		const upcoming = items[2]!;
		expect(upcoming.querySelector('details')).not.toBeNull();
		expect(within(upcoming).getByText('Lessons 19-30')).toBeTruthy();
	});
});
