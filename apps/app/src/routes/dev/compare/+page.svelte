<script lang="ts">
	import AppShell from '#lib/components/AppShell.svelte';
	import ComparePage from '#lib/compare/ComparePage.svelte';

	let { data } = $props();
</script>

<svelte:head><title>Compare preview</title></svelte:head>

<AppShell role={data.role} pathname="/compare">
	<ComparePage {data} apiBase="/dev/mock-api" />
</AppShell>
