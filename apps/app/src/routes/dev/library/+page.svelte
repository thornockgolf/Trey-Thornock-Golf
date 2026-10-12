<script lang="ts">
	import AppShell from '#lib/components/AppShell.svelte';
	import ReferenceLibrary from '#lib/videos/ReferenceLibrary.svelte';

	let { data } = $props();
</script>

<svelte:head><title>Reference library preview</title></svelte:head>

<AppShell role="coach" pathname="/coach/library">
	<ReferenceLibrary videos={data.videos} refresh={() => {}} apiBase="/dev/mock-api" />
</AppShell>
