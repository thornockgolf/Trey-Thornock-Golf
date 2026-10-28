<script lang="ts">
	import Upload from '@lucide/svelte/icons/upload';
	import type { VideoDto } from '@ttg/shared';
	import { online } from '#lib/online.svelte';
	import { VIDEO_EVENT, unread } from '#lib/realtime/unread.svelte';
	import { POLL_MS, libraryVideos, shouldPoll } from './library';
	import InlineUpload from '#lib/upload/InlineUpload.svelte';
	import { page } from '$app/state';
	import VideoLibrary from './VideoLibrary.svelte';

	/** `refresh` reloads the list (the route passes `invalidate('app:videos')`). */
	let { videos, refresh, apiBase }: { videos: readonly VideoDto[]; refresh: () => unknown; apiBase?: string } = $props();

	let uploader: ReturnType<typeof InlineUpload> | undefined = $state();
	const openPicker = () => uploader?.open();
	// Other pages link here with ?upload=1; the picker needs a tap, so the page shows a prompt button instead of opening it.
	const prompted = $derived(page.url.searchParams.get('upload') === '1');

	// Poll while a video is uploaded/processing, only when visible and online.
	let visible = $state(true);
	$effect(() => {
		const onVis = () => (visible = document.visibilityState === 'visible');
		onVis();
		document.addEventListener('visibilitychange', onVis);
		return () => document.removeEventListener('visibilitychange', onVis);
	});
	// A `video.ready`/`video.failed` push (user channel, see AppShell) refreshes at once; the poll is the fallback.
	$effect(() => {
		const onEvent = () => void refresh();
		window.addEventListener(VIDEO_EVENT, onEvent);
		return () => window.removeEventListener(VIDEO_EVENT, onEvent);
	});
	$effect(() => {
		if (!shouldPoll(videos) || !visible || !online.current || unread.live) return;
		const t = setInterval(() => void refresh(), POLL_MS);
		return () => clearInterval(t);
	});
</script>

<div class="mb-6 flex flex-wrap items-end justify-between gap-4">
	<div>
		<p class="eyebrow">Library</p>
		<h1 class="h1">Your videos</h1>
	</div>
	{#if online.current}
		<button type="button" class="btn min-h-12 preset-filled-tertiary-500 {prompted ? 'ring-4 ring-tertiary-500/40' : ''}" onclick={openPicker}><Upload class="size-5" strokeWidth={1.8} aria-hidden="true" /> Upload</button>
	{:else}
		<button type="button" class="btn min-h-12 preset-filled-tertiary-500 opacity-60" disabled title="Unavailable while offline">
			<Upload class="size-5" strokeWidth={1.8} aria-hidden="true" /> Upload
		</button>
	{/if}
</div>

<InlineUpload bind:this={uploader} {apiBase} onuploaded={() => void refresh()} />

<VideoLibrary {videos} onupload={online.current ? openPicker : undefined} />
