<script lang="ts">
	import Library from '@lucide/svelte/icons/library';
	import type { VideoDto } from '@ttg/shared';
	import { online } from '#lib/online.svelte';
	import UploadPanel from '#lib/upload/UploadPanel.svelte';
	import { UploadStore } from '#lib/upload/upload-store.svelte';
	import { POLL_MS, shouldPoll } from './library';
	import VideoLibrary from './VideoLibrary.svelte';

	interface Props {
		videos: readonly VideoDto[];
		/** Reload the list (the route passes `invalidate('app:references')`). */
		refresh: () => unknown;
		/** API base for the uploader (`/api`; dev previews use a mock). */
		apiBase?: string;
	}
	let { videos, refresh, apiBase = '/api' }: Props = $props();

	// reference clips go through the same upload and processing pipeline as swings
	// svelte-ignore state_referenced_locally (the API base never changes for a mounted page)
	const store = new UploadStore({ kind: 'reference', apiBase });
	$effect(() => () => store.destroy());

	// show a just-uploaded clip as soon as the upload is confirmed
	$effect(() => {
		if (store.state.kind === 'success') void refresh();
	});

	// Realtime is not built yet: poll while a clip is processing
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

<div class="mx-auto max-w-[1100px]">
	<p class="eyebrow">Coach</p>
	<h1 class="h1">Reference library</h1>
	<p class="mt-2 mb-6 max-w-2xl text-surface-600-400">
		Pro and model swings that players can compare their own swing against. Upload one here; it is processed like any other video. Only you can add to this library.
	</p>

	<div class="mx-auto mb-10 max-w-2xl">
		<UploadPanel {store} reference libraryHref="/coach/library" />
	</div>

	<h2 class="h3 mb-4">In the library</h2>
	{#if videos.length === 0}
		<div class="mx-auto flex max-w-[480px] flex-col items-center gap-3 rounded-container border border-dashed border-surface-300-700 bg-surface-100-900 px-6 py-10 text-center">
			<span class="flex size-14 items-center justify-center rounded-[14px] surface-raised text-primary-500 dark:text-primary-200">
				<Library class="size-7" strokeWidth={1.8} aria-hidden="true" />
			</span>
			<p class="font-display text-lg font-bold text-secondary-500 dark:text-secondary-100">No reference videos yet</p>
			<p class="text-surface-600-400">Upload a pro or model swing above. Players will be able to pick it in Compare.</p>
		</div>
	{:else}
		<VideoLibrary {videos} label="Reference videos" />
	{/if}
</div>
