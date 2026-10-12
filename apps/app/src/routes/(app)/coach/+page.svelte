<script lang="ts">
	import DashboardPage from '#lib/coach/DashboardPage.svelte';

	let { data } = $props();
</script>

<svelte:head><title>Coach | Trey Thornock Golf</title></svelte:head>

<DashboardPage players={data.players} />
