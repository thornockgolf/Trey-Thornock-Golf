<script lang="ts">
	import Pencil from '@lucide/svelte/icons/pencil';
	import Plus from '@lucide/svelte/icons/plus';
	import type { DrillDto } from '@ttg/shared';
	import { toaster } from '#lib/toaster';
	import { ApiError, apiClient } from './coach-client';

	interface Props {
		drills: readonly DrillDto[];
		apiBase?: string;
		onChanged: (d: DrillDto) => void;
	}
	let { drills, apiBase = '/api', onChanged }: Props = $props();

	interface Form {
		id: string | null;
		name: string;
		category: string;
		purpose: string;
		setup: string;
		steps: string;
		cues: string;
		successCriteria: string;
		commonMistake: string;
		progression: string;
		regression: string;
		defaultMinutes: string;
	}
	const blank = (): Form => ({ id: null, name: '', category: '', purpose: '', setup: '', steps: '', cues: '', successCriteria: '', commonMistake: '', progression: '', regression: '', defaultMinutes: '' });
	let form = $state<Form | null>(null);
	let busy = $state(false);
	let error = $state<string | null>(null);
	let filter = $state('');

	const edit = (d: DrillDto) => {
		error = null;
		form = {
			id: d.id,
			name: d.name,
			category: d.category ?? '',
			purpose: d.purpose ?? '',
			setup: d.setup ?? '',
			steps: d.steps.join('\n'),
			cues: d.cues ?? '',
			successCriteria: d.successCriteria ?? '',
			commonMistake: d.commonMistake ?? '',
			progression: d.progression ?? '',
			regression: d.regression ?? '',
			defaultMinutes: d.defaultMinutes ? String(d.defaultMinutes) : ''
		};
	};

	const text = (v: string) => (v.trim() ? v.trim() : undefined);
	const save = async () => {
		if (!form) return;
		busy = true;
		error = null;
		const minutes = form.defaultMinutes.trim() ? Number(form.defaultMinutes) : undefined;
		const body = {
			name: form.name.trim(),
			category: text(form.category),
			purpose: text(form.purpose),
			setup: text(form.setup),
			steps: form.steps.split('\n').map((s) => s.trim()).filter(Boolean),
			cues: text(form.cues),
			successCriteria: text(form.successCriteria),
			commonMistake: text(form.commonMistake),
			progression: text(form.progression),
			regression: text(form.regression),
			defaultMinutes: minutes
		};
		try {
			const c = apiClient(apiBase).drills;
			const saved = form.id ? await c.update(form.id, body) : await c.create(body);
			onChanged(saved);
			toaster.success({ title: 'Drill saved' });
			form = null;
		} catch (e) {
			error = e instanceof ApiError ? e.message : 'Could not save the drill. Try again.';
		} finally {
			busy = false;
		}
	};

	const shown = $derived(drills.filter((d) => d.name.toLowerCase().includes(filter.toLowerCase()) || (d.category ?? '').toLowerCase().includes(filter.toLowerCase())));
	const field = 'input min-h-11 text-base';
</script>

<div class="flex flex-col gap-4" data-drills>
	{#if form}
		<form class="flex flex-col gap-3 rounded-container border border-surface-300-700 bg-surface-100-900 p-4" onsubmit={(e) => (e.preventDefault(), void save())} aria-label={form.id ? 'Edit drill' : 'New drill'}>
			<label class="flex flex-col gap-1"><span class="text-sm font-semibold">Name</span><input class={field} bind:value={form.name} maxlength="120" required data-drill-name /></label>
			<div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
				<label class="flex flex-col gap-1"><span class="text-sm font-semibold">Category</span><input class={field} bind:value={form.category} maxlength="80" placeholder="e.g. Putting" /></label>
				<label class="flex flex-col gap-1"><span class="text-sm font-semibold">Usual minutes</span><input class={field} type="number" min="1" max="90" bind:value={form.defaultMinutes} /></label>
			</div>
			{#each [['purpose', 'Purpose'], ['setup', 'Setup'], ['cues', 'Cues'], ['successCriteria', 'Success criteria'], ['commonMistake', 'Common mistake'], ['progression', 'Progression'], ['regression', 'Regression']] as [k, label] (k)}
				<label class="flex flex-col gap-1"><span class="text-sm font-semibold">{label}</span><textarea class="textarea min-h-16 text-base" rows="2" maxlength="2000" bind:value={form[k as 'purpose']}></textarea></label>
			{/each}
			<label class="flex flex-col gap-1"><span class="text-sm font-semibold">Steps (one per line)</span><textarea class="textarea min-h-24 text-base" rows="4" bind:value={form.steps}></textarea></label>
			{#if error}<p class="rounded-container border border-error-500 p-3" role="alert">{error}</p>{/if}
			<div class="flex gap-2">
				<button type="submit" class="btn min-h-12 preset-filled-primary-500" disabled={busy || !form.name.trim()} data-drill-save>{busy ? 'Saving…' : 'Save drill'}</button>
				<button type="button" class="btn min-h-12 preset-outlined-surface-300-700" onclick={() => (form = null)}>Cancel</button>
			</div>
		</form>
	{:else}
		<div class="flex flex-wrap items-end gap-3">
			<label class="flex min-w-0 flex-1 flex-col gap-1"><span class="text-sm font-semibold">Find a drill</span><input class={field} type="search" bind:value={filter} placeholder="Name or category" /></label>
			<button type="button" class="btn min-h-12 preset-filled-primary-500" onclick={() => ((form = blank()), (error = null))} data-new-drill><Plus class="size-5" strokeWidth={1.8} aria-hidden="true" /> New drill</button>
		</div>
		<ul class="flex flex-col gap-2" aria-label="Drills">
			{#each shown as d (d.id)}
				<li class="flex flex-wrap items-center gap-2 rounded-container border border-surface-300-700 bg-surface-100-900 p-3">
					<span class="min-w-0 flex-1"><span class="font-medium break-words">{d.name}</span> <span class="text-sm text-surface-600-400">{d.category ?? ''}{d.defaultMinutes ? ` · ${d.defaultMinutes} min` : ''}</span></span>
					<button type="button" class="btn min-h-11 preset-outlined-surface-300-700" onclick={() => edit(d)} aria-label="Edit {d.name}"><Pencil class="size-4" strokeWidth={1.8} aria-hidden="true" /> Edit</button>
				</li>
			{:else}
				<li class="text-surface-600-400">No drills match.</li>
			{/each}
		</ul>
	{/if}
</div>
