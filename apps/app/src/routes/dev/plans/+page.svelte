<script lang="ts">
	import { page } from '$app/state';
	import AppShell from '#lib/components/AppShell.svelte';
	import PlansPage from '#lib/coach/PlansPage.svelte';

	let { data } = $props();
</script>

<svelte:head><title>Plans preview</title></svelte:head>

<AppShell role="coach" pathname="/coach/plans">
	<PlansPage plans={data.plans} drills={data.drills} players={data.players} apiBase="/dev/mock-api" openPlanId={page.url.searchParams.get('plan')} openDrillId={page.url.searchParams.get('drill')} />
</AppShell>
