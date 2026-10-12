<script lang="ts">
	import { invalidate } from '$app/navigation';
	import ReferenceLibrary from '#lib/videos/ReferenceLibrary.svelte';

	let { data } = $props();
</script>

<svelte:head><title>Reference library | Trey Thornock Golf</title></svelte:head>

<ReferenceLibrary videos={data.videos} refresh={() => invalidate('app:references')} />
