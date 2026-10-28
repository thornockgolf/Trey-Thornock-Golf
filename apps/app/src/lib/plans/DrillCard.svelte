<script lang="ts">
	import type { DrillDto } from '@ttg/shared';
	import { toaster } from '#lib/toaster';

	/** A drill in a session. Details are fetched the first time it opens (players may read drills in their own sessions). */
	let { drillId, name, minutes }: { drillId: string; name: string; minutes: number } = $props();

	let open = $state(false);
	let drill = $state<DrillDto | null>(null);
	let loading = $state(false);

	const toggle = async () => {
		open = !open;
		if (!open || drill || loading) return;
		loading = true;
		try {
			const res = await fetch(`/api/drills/${drillId}`);
			if (!res.ok) throw new Error();
			drill = (await res.json()) as DrillDto;
		} catch {
			open = false;
			toaster.error({ title: 'Could not load this drill. Try again.' });
		} finally {
			loading = false;
		}
	};

	const sections = $derived.by((): [string, string][] => {
		if (!drill) return [];
		const all: [string, string | null][] = [
			['Purpose', drill.purpose],
			['Setup', drill.setup],
			['Cues', drill.cues],
			['Success looks like', drill.successCriteria],
			['Common mistake', drill.commonMistake],
			['Make it harder', drill.progression],
			['Make it easier', drill.regression]
		];
		return all.flatMap(([label, text]): [string, string][] => (text ? [[label, text]] : []));
	});
</script>

<div class="flex flex-col">
	<button
		type="button"
		class="btn min-h-12 justify-between py-2 preset-tonal text-left"
		aria-expanded={open}
		aria-controls="drill-{drillId}"
		onclick={toggle}
	>
		<span class="min-w-0 whitespace-normal">{name} <span class="text-surface-600-400">· {minutes} min</span></span>
		<span class="shrink-0" aria-hidden="true">{open ? '▴' : '▾'}</span>
	</button>

	{#if open}
		<div id="drill-{drillId}" class="flex flex-col gap-3 p-4" aria-live="polite">
			{#if loading}
				<p class="text-surface-600-400">Loading…</p>
			{:else if drill}
				{#each sections as [label, text] (label)}
					<div>
						<h4 class="font-display font-semibold text-surface-700-300">{label}</h4>
						<p>{text}</p>
					</div>
				{/each}
				{#if drill.steps.length > 0}
					<div>
						<h4 class="font-display font-semibold text-surface-700-300">How to do it</h4>
						<ol class="list-decimal pl-5">
							{#each drill.steps as step, n (n)}<li>{step}</li>{/each}
						</ol>
					</div>
				{/if}
			{/if}
		</div>
	{/if}
</div>
