<script lang="ts">
	import Plus from '@lucide/svelte/icons/plus';
	import type { DrillDto, PlanDto, PlayerSummaryDto } from '@ttg/shared';
	import { toaster } from '#lib/toaster';
	import { localDate } from '#lib/plans/sessions';
	import AssignPanel from './AssignPanel.svelte';
	import DrillEditor from './DrillEditor.svelte';
	import PlanComposer from './PlanComposer.svelte';
	import { ApiError, apiClient } from './coach-client';
	import { canSave, emptyPlan, fromStructure, planProblems, toStructure, type ComposerPlan } from './composer';

	interface Props {
		plans: readonly PlanDto[];
		drills: readonly DrillDto[];
		/** Players the coach is working with (the ones a plan can be assigned to). */
		players: readonly PlayerSummaryDto[];
		/** `/api` in the app, a mock path in dev previews. */
		apiBase?: string;
	}
	let { plans: initialPlans, drills: initialDrills, players, apiBase = '/api' }: Props = $props();

	// svelte-ignore state_referenced_locally
	let plans = $state<PlanDto[]>([...initialPlans]);
	// svelte-ignore state_referenced_locally
	let drills = $state<DrillDto[]>([...initialDrills]);
	let tab = $state<'plans' | 'drills'>('plans');
	let selected = $state<string | null>(null); // plan id, or null for an unsaved new plan
	let plan = $state<ComposerPlan>(emptyPlan());
	let saving = $state(false);
	let error = $state<string | null>(null);
	let dirty = $state(false);
	let today = $state('');
	$effect(() => {
		today = localDate();
	});

	const problems = $derived(planProblems(plan));
	const selectedPlan = $derived(plans.find((p) => p.id === selected) ?? null);

	const open = (p: PlanDto) => {
		selected = p.id;
		plan = fromStructure(p.title, p.structure);
		error = null;
		dirty = false;
	};
	const startNew = () => {
		selected = null;
		plan = emptyPlan();
		error = null;
		dirty = false;
	};
	$effect(() => {
		// any edit to the plan marks it unsaved
		void JSON.stringify(plan);
		dirty = true;
	});

	const save = async () => {
		saving = true;
		error = null;
		try {
			const api = apiClient(apiBase).plans;
			const body = { title: plan.title.trim(), structure: toStructure(plan) };
			const saved = selected ? await api.update(selected, body) : await api.create(body);
			plans = selected ? plans.map((p) => (p.id === saved.id ? saved : p)) : [saved, ...plans];
			selected = saved.id;
			plan = fromStructure(saved.title, saved.structure);
			queueMicrotask(() => (dirty = false));
			toaster.success({ title: 'Plan saved' });
		} catch (e) {
			error = e instanceof ApiError ? e.message : 'Could not save the plan. Try again.';
		} finally {
			saving = false;
		}
	};

	const onDrill = (d: DrillDto) => {
		drills = drills.some((x) => x.id === d.id) ? drills.map((x) => (x.id === d.id ? d : x)) : [...drills, d].sort((a, b) => a.name.localeCompare(b.name));
	};
</script>

<div class="mx-auto max-w-[1100px]">
	<p class="eyebrow">Coach</p>
	<h1 class="h1">Practice plans</h1>
	<p class="mt-2 mb-4 max-w-2xl text-surface-600-400">Build a plan from your drills, then assign it to a player. Each session is 30, 45, 60 or 90 minutes and its drills must add up to that exactly.</p>

	<div class="mb-6 flex gap-1" role="tablist" aria-label="Plans or drills">
		{#each [['plans', 'Plans'], ['drills', 'Drills']] as [t, name] (t)}
			<button type="button" role="tab" aria-selected={tab === t} class="btn min-h-12 {tab === t ? 'preset-filled-primary-500' : 'preset-outlined-surface-300-700'}" onclick={() => (tab = t as 'plans' | 'drills')} data-tab={t}>{name}</button>
		{/each}
	</div>

	{#if tab === 'drills'}
		<DrillEditor {drills} {apiBase} onChanged={onDrill} />
	{:else}
		<div class="grid grid-cols-1 gap-6 lg:grid-cols-[280px_1fr]">
			<nav aria-label="Your plans" class="flex flex-col gap-2">
				<button type="button" class="btn min-h-12 preset-filled-tertiary-500" onclick={startNew} data-new-plan><Plus class="size-5" strokeWidth={1.8} aria-hidden="true" /> New plan</button>
				<ul class="flex flex-col gap-2">
					{#each plans as p (p.id)}
						<li>
							<button type="button" class="flex min-h-12 w-full flex-col items-start rounded-container border px-3 py-2 text-left {selected === p.id ? 'border-primary-500 bg-primary-50-950' : 'border-surface-300-700 bg-surface-100-900'}" aria-current={selected === p.id ? 'true' : undefined} onclick={() => open(p)} data-plan-item>
								<span class="font-medium break-words">{p.title}</span>
								<span class="text-sm text-surface-600-400">{p.structure.sessions.length} session{p.structure.sessions.length === 1 ? '' : 's'}</span>
							</button>
						</li>
					{:else}
						<li class="text-surface-600-400">No plans yet.</li>
					{/each}
				</ul>
			</nav>

			<div class="flex min-w-0 flex-col gap-5">
				<PlanComposer bind:plan {drills} disabled={saving} />

				{#if problems.length > 0}
					<ul class="list-disc pl-5 text-sm text-surface-600-400" aria-label="What still needs fixing" data-problems>
						{#each problems as p (p)}<li>{p}</li>{/each}
					</ul>
				{/if}
				{#if error}<p class="rounded-container border border-error-500 p-3" role="alert">{error}</p>{/if}
				<div class="flex flex-wrap items-center gap-3">
					<button type="button" class="btn min-h-12 preset-filled-primary-500" disabled={saving || !canSave(plan)} onclick={save} data-save-plan>{saving ? 'Saving…' : selected ? 'Save changes' : 'Save plan'}</button>
					{#if selected && dirty}<span class="text-sm text-warning-700-300" role="status">You have unsaved changes. Save before assigning.</span>{/if}
				</div>

				{#if selectedPlan && !dirty && today}
					<AssignPanel planId={selectedPlan.id} sessionCount={selectedPlan.structure.sessions.length} {players} {apiBase} {today} />
				{/if}
			</div>
		</div>
	{/if}
</div>
