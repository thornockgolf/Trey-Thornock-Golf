<script lang="ts">
	import { onDestroy } from 'svelte';
	import type { ItemVideoDto, PlanSessionDto, VideoDto } from '@ttg/shared';
	import Video from '@lucide/svelte/icons/video';
	import Upload from '@lucide/svelte/icons/upload';
	import { ApiError, apiClient } from '#lib/coach/coach-client';
	import { online } from '#lib/online.svelte';
	import { toaster } from '#lib/toaster';
	import InlineUpload from '#lib/upload/InlineUpload.svelte';
	import { UploadStore } from '#lib/upload/upload-store.svelte';
	import { choosableVideos, itemVideoLabel, withItemVideo } from './drill-video';

	/**
	 * The optional "Show Trey you can do this drill" block inside an open drill. Nothing here is required: a drill is
	 * checked off the same way with or without a video. Upload a new one (the normal upload pipeline, so it also lands
	 * in the player's Videos library) or pick one that is already there. Removing only detaches it.
	 */
	let {
		session,
		itemId,
		video,
		apiBase = '/api',
		uploadApiBase,
		onChange
	}: {
		session: PlanSessionDto;
		itemId: string;
		video: ItemVideoDto | null | undefined;
		apiBase?: string;
		/** Where uploads go (defaults to `apiBase`; the dev preview points both at the mock). */
		uploadApiBase?: string;
		onChange: (next: PlanSessionDto) => void;
	} = $props();

	const api = $derived(apiClient(apiBase));
	// svelte-ignore state_referenced_locally
	const store = new UploadStore({ apiBase: uploadApiBase ?? apiBase });
	onDestroy(() => store.destroy());
	let uploader: ReturnType<typeof InlineUpload> | undefined = $state();

	let busy = $state(false);
	let error = $state<string | null>(null);
	let changing = $state(false); // showing the two buttons while a video is already attached
	let choosing = $state(false);
	let library = $state<VideoDto[] | null>(null);
	let loadingLibrary = $state(false);

	const uploading = $derived(store.busy);
	const showOptions = $derived(!video || changing);
	const path = $derived(`/sessions/${session.id}/items/${itemId}/video`);

	const save = async (videoId: string, optimistic: ItemVideoDto) => {
		busy = true;
		error = null;
		const before = session;
		onChange(withItemVideo(session, itemId, optimistic));
		try {
			onChange(await api.call<PlanSessionDto>('PUT', path, { videoId }));
			choosing = false;
			changing = false;
		} catch (e) {
			onChange(before);
			error = e instanceof ApiError ? e.message : 'Could not attach the video. Check your connection and try again.';
		} finally {
			busy = false;
		}
	};

	/** The server has the upload: attach it (the library lists it as processing until it is ready). */
	const attachUploaded = async () => {
		const id = store.videoId;
		if (!id) return;
		await save(id, { id, status: 'processing', title: null });
		store.reset(); // the card below says it all; hide the upload panel
	};

	const choose = async (v: VideoDto) => save(v.id, { id: v.id, status: v.status, title: v.title });

	const openChooser = async () => {
		choosing = !choosing;
		error = null;
		if (!choosing || library) return;
		loadingLibrary = true;
		try {
			library = choosableVideos((await api.call<{ videos: VideoDto[] }>('GET', '/videos')).videos);
		} catch {
			choosing = false;
			error = 'Could not load your videos. Try again.';
		} finally {
			loadingLibrary = false;
		}
	};

	const remove = async () => {
		busy = true;
		error = null;
		const before = session;
		onChange(withItemVideo(session, itemId, null));
		try {
			onChange(await api.call<PlanSessionDto>('DELETE', path));
			changing = false;
			toaster.success({ title: 'Removed from this drill. The video is still in your library.' });
		} catch (e) {
			onChange(before);
			error = e instanceof ApiError ? e.message : 'Could not remove it. Try again.';
		} finally {
			busy = false;
		}
	};
</script>

<section class="flex flex-col gap-3 rounded-container border border-surface-200-800 surface-raised p-3" aria-label="Drill video, optional" data-drill-video>
	<h4 class="font-display font-semibold text-surface-700-300">
		Show Trey you can do this drill <span class="font-body font-normal text-surface-600-400">(optional)</span>
	</h4>

	<InlineUpload bind:this={uploader} {store} apiBase={uploadApiBase ?? apiBase} onuploaded={attachUploaded} />

	{#if video && !uploading}
		<div class="flex flex-wrap items-center gap-x-3 gap-y-2" data-attached-video={video.status}>
			<Video class="size-5 shrink-0" aria-hidden="true" />
			<p class="min-w-0 flex-1">
				<span class="font-medium">{video.title ?? 'Your video'}</span>
				<span class="block text-sm text-surface-600-400">{itemVideoLabel(video.status)}</span>
			</p>
			<div class="flex flex-wrap gap-2">
				{#if video.status === 'ready'}<a class="btn min-h-11 preset-tonal-primary" href="/videos/{video.id}">View</a>{/if}
				<button type="button" class="btn min-h-11 preset-outlined-secondary-500" onclick={() => ((changing = !changing), (choosing = false))} disabled={busy} aria-expanded={changing}>Replace</button>
				<button type="button" class="btn min-h-11 preset-tonal-error" onclick={remove} disabled={busy}>Remove</button>
			</div>
		</div>
	{/if}

	{#if showOptions && !uploading}
		<div class="flex flex-col gap-2 sm:flex-row">
			<button type="button" class="btn min-h-12 preset-outlined-secondary-500" onclick={() => ((choosing = false), uploader?.open())} disabled={busy || !online.current} data-upload-video>
				<Upload class="size-5" aria-hidden="true" /> Upload a video
			</button>
			<button type="button" class="btn min-h-12 preset-outlined-secondary-500" onclick={openChooser} disabled={busy} aria-expanded={choosing} data-choose-video>
				<Video class="size-5" aria-hidden="true" /> Choose from my videos
			</button>
		</div>
	{/if}

	{#if choosing && showOptions && !uploading}
		<div data-video-chooser>
			{#if loadingLibrary}
				<p class="text-surface-600-400">Loading your videos…</p>
			{:else if library && library.length === 0}
				<p class="text-surface-600-400">No finished videos in your library yet. Upload one instead.</p>
			{:else if library}
				<ul class="flex max-h-72 flex-col gap-1 overflow-y-auto">
					{#each library as v (v.id)}
						<li>
							<button type="button" class="flex min-h-14 w-full items-center gap-3 rounded-base p-2 text-left hover:bg-surface-100-900" onclick={() => choose(v)} disabled={busy} data-pick-video={v.id}>
								<span class="aspect-video w-20 shrink-0 overflow-hidden rounded-base bg-surface-200-800">
									{#if v.posterUrl}<img src={v.posterUrl} alt="" loading="lazy" class="size-full object-cover" />{/if}
								</span>
								<span class="min-w-0 flex-1">
									<span class="block truncate font-medium">{v.title ?? 'Untitled video'}</span>
									<span class="block text-sm text-surface-600-400">{new Date(v.createdAt).toLocaleDateString()}</span>
								</span>
							</button>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	{/if}

	{#if error}<p class="rounded-base border border-error-200-800 bg-error-50-950 p-3 text-error-700-300" role="alert" data-video-error>{error}</p>{/if}
	{#if store.state.kind === 'error'}<p class="text-sm text-surface-600-400">The drill still works without the video. You can retry, or skip it.</p>{/if}
</section>
