<script lang="ts">
	import ComparePage from '#lib/compare/ComparePage.svelte';

	let { data } = $props();
</script>

<svelte:head><title>Compare | Trey Thornock Golf</title></svelte:head>

<ComparePage {data} />
