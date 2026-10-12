<script lang="ts">
	import PlansPage from '#lib/coach/PlansPage.svelte';

	let { data } = $props();
</script>

<svelte:head><title>Practice plans | Trey Thornock Golf</title></svelte:head>

<PlansPage plans={data.plans} drills={data.drills} players={data.players} />
