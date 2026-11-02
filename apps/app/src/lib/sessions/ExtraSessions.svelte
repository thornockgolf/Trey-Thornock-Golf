<script lang="ts">
	import type { LoggedSessionDto } from '@ttg/shared';
	import LoggedSessionCard from './LoggedSessionCard.svelte';

	/** The player's logged extras, newest first (three, then "Show all"). */
	let { logged }: { logged: readonly LoggedSessionDto[] } = $props();

	let showAll = $state(false);
	const shown = $derived(showAll ? logged : logged.slice(0, 3));
</script>

{#if logged.length > 0}
	<section class="mt-8 flex flex-col gap-4" aria-labelledby="extras-heading" data-extras>
		<div>
			<h2 id="extras-heading" class="h2">Extra sessions</h2>
			<p class="text-sm text-surface-600-400">Practice you logged outside the plan. These do not count towards your lessons.</p>
		</div>
		{#each shown as l (l.id)}<LoggedSessionCard session={l} editHref="/sessions/{l.id}/edit" />{/each}
		{#if logged.length > 3}
			<div><button type="button" class="btn min-h-12 preset-tonal-surface" onclick={() => (showAll = !showAll)}>{showAll ? 'Show fewer' : `Show all ${logged.length}`}</button></div>
		{/if}
	</section>
{/if}
