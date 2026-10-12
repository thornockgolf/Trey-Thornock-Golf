<script lang="ts">
	import Upload from '@lucide/svelte/icons/upload';
	import type { VideoDto } from '@ttg/shared';
	import { online } from '#lib/online.svelte';
	import { POLL_MS, libraryVideos, shouldPoll } from './library';
	import VideoLibrary from './VideoLibrary.svelte';

	/** `refresh` reloads the list (the route passes `invalidate('app:videos')`). */
	let { videos, refresh }: { videos: readonly VideoDto[]; refresh: () => unknown } = $props();

	// Realtime is not built yet: poll while a video is uploaded/processing, only when visible and online.
	let visible = $state(true);
	$effect(() => {
		const onVis = () => (visible = document.visibilityState === 'visible');
		onVis();
		document.addEventListener('visibilitychange', onVis);
		return () => document.removeEventListener('visibilitychange', onVis);
	});
	$effect(() => {
		if (!shouldPoll(videos) || !visible || !online.current) return;
		const t = setInterval(() => void refresh(), POLL_MS);
		return () => clearInterval(t);
	});
</script>

<div class="mb-6 flex flex-wrap items-end justify-between gap-4">
	<div>
		<p class="eyebrow">Library</p>
		<h1 class="h1">Your videos</h1>
	</div>
	{#if libraryVideos(videos).length > 0}
		{#if online.current}
			<a href="/videos/new" class="btn min-h-12 preset-filled-tertiary-500"><Upload class="size-5" strokeWidth={1.8} aria-hidden="true" /> Upload</a>
		{:else}
			<button type="button" class="btn min-h-12 preset-filled-tertiary-500 opacity-60" disabled title="Unavailable while offline">
				<Upload class="size-5" strokeWidth={1.8} aria-hidden="true" /> Upload
			</button>
		{/if}
	{/if}
</div>

<VideoLibrary {videos} />
