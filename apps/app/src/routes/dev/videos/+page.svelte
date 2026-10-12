<script lang="ts">
	import { invalidate } from '$app/navigation';
	import AppShell from '#lib/components/AppShell.svelte';
	import LibraryPage from '#lib/videos/LibraryPage.svelte';

	let { data } = $props();
</script>

<AppShell role={data.role} pathname="/videos">
	<nav class="mb-6 flex flex-wrap gap-2 text-xs" aria-label="Preview states">
		{#each ['all', 'empty', 'live'] as st (st)}
			<a class="chip {st === data.state ? 'preset-filled-secondary-500' : 'preset-tonal-surface'}" href="?state={st}&role={data.role}">{st}</a>
		{/each}
	</nav>
	<LibraryPage videos={data.videos} refresh={() => invalidate('app:videos')} />
</AppShell>
