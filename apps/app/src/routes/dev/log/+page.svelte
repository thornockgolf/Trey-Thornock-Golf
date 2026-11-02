<script lang="ts">
	import { page } from '$app/state';
	import AppShell from '#lib/components/AppShell.svelte';
	import LogSessionForm from '#lib/sessions/LogSessionForm.svelte';

	let { data } = $props();
	let saved = $state<string | null>(null);
</script>

<svelte:head><title>Log a practice session preview</title></svelte:head>

<AppShell role="player" pathname="/plans">
	<div class="mb-6">
		<p class="eyebrow">Practice</p>
		<h1 class="h1">{data.existing ? 'Edit practice session' : 'Log a practice session'}</h1>
		<p class="mt-2 max-w-2xl text-surface-600-400">Practised outside your plan, or got ahead on it? Log it here. It is a practice session like any other: it shows up on your calendar and Trey can see it. It does not move your lessons forward.</p>
	</div>
	{#key data.existing?.id}
		<LogSessionForm
			drills={data.drills}
			existing={data.existing ?? undefined}
			initialDate={page.url.searchParams.get('date')}
			apiBase="/dev/mock-api"
			onsaved={(s) => (saved = s ? JSON.stringify(s, null, 2) : 'deleted')}
			oncancel={() => (saved = 'cancelled')}
		/>
	{/key}
	{#if saved}<pre class="mt-6 max-w-2xl overflow-x-auto rounded-container border border-surface-200-800 p-3 text-xs" data-saved>{saved}</pre>{/if}
</AppShell>
