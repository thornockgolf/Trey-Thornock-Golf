<script lang="ts">
	import { page } from '$app/state';
	import PlansPage from '#lib/coach/PlansPage.svelte';

	let { data } = $props();
</script>

<svelte:head><title>Practice plans | Trey Thornock Golf</title></svelte:head>

{#key page.url.search}
	<PlansPage plans={data.plans} drills={data.drills} players={data.players} openPlanId={page.url.searchParams.get('plan')} openDrillId={page.url.searchParams.get('drill')} />
{/key}
