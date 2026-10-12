<script lang="ts">
	import { invalidate } from '$app/navigation';
	import LibraryPage from '#lib/videos/LibraryPage.svelte';

	let { data } = $props();
</script>

<svelte:head><title>Videos | Trey Thornock Golf</title></svelte:head>

<LibraryPage videos={data.videos} refresh={() => invalidate('app:videos')} />
