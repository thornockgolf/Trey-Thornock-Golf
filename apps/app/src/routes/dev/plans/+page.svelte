<script lang="ts">
	import AppShell from '#lib/components/AppShell.svelte';
	import PlansPage from '#lib/coach/PlansPage.svelte';

	let { data } = $props();
</script>

<svelte:head><title>Plans preview</title></svelte:head>

<AppShell role="coach" pathname="/coach/plans">
	<PlansPage plans={data.plans} drills={data.drills} players={data.players} apiBase="/dev/mock-api" />
</AppShell>
