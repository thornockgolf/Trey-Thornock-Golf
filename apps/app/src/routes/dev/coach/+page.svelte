<script lang="ts">
	import AppShell from '#lib/components/AppShell.svelte';
	import DashboardPage from '#lib/coach/DashboardPage.svelte';

	let { data } = $props();
</script>

<svelte:head><title>Coach dashboard preview</title></svelte:head>

<AppShell role="coach" pathname="/coach">
	<DashboardPage players={data.players} apiBase="/dev/mock-api" playerHref={() => '/dev/coach-player'} />
</AppShell>
