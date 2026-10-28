<script lang="ts">
	import AppShell from '#lib/components/AppShell.svelte';
	import HomePage from '#lib/home/HomePage.svelte';

	let { data } = $props();
</script>

<svelte:head><title>Home preview</title></svelte:head>

<AppShell role="player" pathname="/">
	<HomePage home={data.home} />
</AppShell>
