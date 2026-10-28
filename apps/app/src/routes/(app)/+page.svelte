<script lang="ts">
	import HomePage from '#lib/home/HomePage.svelte';

	let { data } = $props();
</script>

<svelte:head><title>Home | Trey Thornock Golf</title></svelte:head>

<HomePage home={data} />
