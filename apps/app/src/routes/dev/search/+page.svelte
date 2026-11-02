<script lang="ts">
	import AppShell from '#lib/components/AppShell.svelte';
</script>

<AppShell role="coach" pathname="/coach">
	<p class="eyebrow">Coach</p>
	<h1 class="h1">Search preview</h1>
	<p class="mt-4 max-w-prose">Dev only. Press <kbd>/</kbd> or Ctrl+K, or tap the search icon on a phone. Try "tempo", "slcie", "rivera", "short", "zzz", "boom" (error) and "slow".</p>
	<p class="mt-4 max-w-prose text-surface-700-300">Page content sits under the results panel so you can check how it overlays.</p>
	{#each Array(6) as _, i (i)}
		<div class="mt-4 rounded-container border border-surface-300-700 p-6 surface-raised">Placeholder card {i + 1}</div>
	{/each}
</AppShell>
