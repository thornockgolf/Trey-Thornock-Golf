import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import Harness from './PhasesHarness.svelte';
import { emptyPlan, addSession, toStructure, type ComposerPlan } from './composer';


const planOf = (n: number): ComposerPlan => {
	let p = emptyPlan();
	for (let i = 1; i < n; i++) p = addSession(p);
	return p;
};

const mount = (plan: ComposerPlan) => {
	const out = { plan };
	render(Harness, { plan, onChange: (p: ComposerPlan) => (out.plan = p) });
	return out;
};

afterEach(cleanup);

describe('PhasesEditor', () => {
	it('shows the lesson count and no cards for a plan without phases', () => {
		mount(planOf(4));
		expect(screen.getByText(/this plan has 4 lessons/i)).toBeTruthy();
		expect(screen.queryAllByRole('group', { name: /^Phase/ })).toHaveLength(0);
	});

	it('adds a phase pre-filled after the last one and edits it', async () => {
		const out = mount(planOf(5));
		await fireEvent.click(screen.getByRole('button', { name: /add phase/i }));
		await fireEvent.input(screen.getByLabelText('Phase 1 title'), { target: { value: 'Setup' } });
		await fireEvent.input(screen.getByLabelText('Last lesson of phase 1'), { target: { value: '2' } });
		await fireEvent.click(screen.getByRole('button', { name: /add phase/i }));
		expect((screen.getByLabelText('First lesson of phase 2') as HTMLInputElement).value).toBe('3');
		expect(out.plan.phases[0]).toMatchObject({ title: 'Setup', toLesson: 2 });
		expect(screen.getByText(/No phase yet for lessons 4-5/)).toBeTruthy();
	});

	it('shows inline errors for an overlap and past the last lesson', async () => {
		mount(planOf(3));
		await fireEvent.click(screen.getByRole('button', { name: /add phase/i }));
		await fireEvent.input(screen.getByLabelText('Last lesson of phase 1'), { target: { value: '5' } });
		expect(screen.getByText('This plan only has 3 lessons.')).toBeTruthy();
		await fireEvent.input(screen.getByLabelText('Last lesson of phase 1'), { target: { value: '2' } });
		await fireEvent.click(screen.getByRole('button', { name: /add phase/i }));
		await fireEvent.input(screen.getByLabelText('First lesson of phase 2'), { target: { value: '2' } });
		expect(screen.getByText(/Starts inside or before the phase above/)).toBeTruthy();
	});

	it('moves and deletes phases', async () => {
		const out = mount(planOf(4));
		await fireEvent.click(screen.getByRole('button', { name: /add phase/i }));
		await fireEvent.input(screen.getByLabelText('Phase 1 title'), { target: { value: 'A' } });
		await fireEvent.input(screen.getByLabelText('Last lesson of phase 1'), { target: { value: '2' } });
		await fireEvent.click(screen.getByRole('button', { name: /add phase/i }));
		await fireEvent.input(screen.getByLabelText('Phase 2 title'), { target: { value: 'B' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Move phase 2 up' }));
		expect(out.plan.phases.map((p) => p.title)).toEqual(['B', 'A']);
		await fireEvent.click(screen.getByRole('button', { name: 'Delete phase 1' }));
		expect(out.plan.phases.map((p) => p.title)).toEqual(['A']);
		expect(toStructure(out.plan).phases).toHaveLength(1);
	});
});
