<script lang="ts">
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import Download from '@lucide/svelte/icons/download';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import type { PlaybackSource } from '@ttg/ui';
	import type { DownloadResponse, PlaybackResponse, VideoDto } from '@ttg/shared';
	import { online } from '#lib/online.svelte';
	import { toaster } from '#lib/toaster';
	import AnnotatedPlayer from './AnnotatedPlayer.svelte';
	import { POLL_MS, displayTitle, formatDate, formatDuration, shouldPoll, statusChip } from './library';

	interface Props {
		video: VideoDto;
		/** Signed playback URLs; null until the video is ready. */
		playback: PlaybackResponse | null;
		/** Reload the page data (the route passes `invalidate('app:video')`). */
		refresh: () => unknown;
		/** Base of the API, `/api` in the app and a mock path in dev previews. */
		apiBase?: string;
		/** Coaches can draw annotations; players see them read-only. */
		canAnnotate?: boolean;
	}
	let { video, playback, refresh, apiBase = '/api', canAnnotate = false }: Props = $props();

	const chip = $derived(statusChip(video.status));
	const duration = $derived(formatDuration(video.durationMs));
	const toSource = (p: PlaybackResponse): PlaybackSource => ({ url: p.url, expiresAt: p.expiresAt, spriteUrl: p.spriteUrl, spriteVttUrl: p.spriteVttUrl });

	// Realtime is not built yet: poll while the video is still being processed.
	let visible = $state(true);
	$effect(() => {
		const onVis = () => (visible = document.visibilityState === 'visible');
		onVis();
		document.addEventListener('visibilitychange', onVis);
		return () => document.removeEventListener('visibilitychange', onVis);
	});
	$effect(() => {
		if (!shouldPoll([video]) || !visible || !online.current) return;
		const t = setInterval(() => void refresh(), POLL_MS);
		return () => clearInterval(t);
	});

	const refreshSource = async (): Promise<PlaybackSource> => {
		const res = await fetch(`${apiBase}/videos/${video.id}/playback`, { headers: { accept: 'application/json' } });
		if (!res.ok) throw new Error(`playback ${res.status}`);
		return toSource((await res.json()) as PlaybackResponse);
	};

	let downloading = $state<'processed' | 'original' | null>(null);
	const download = async (variant: 'processed' | 'original') => {
		downloading = variant;
		try {
			const res = await fetch(`${apiBase}/videos/${video.id}/download?variant=${variant}`, { headers: { accept: 'application/json' } });
			if (!res.ok) throw new Error(String(res.status));
			const { url } = (await res.json()) as DownloadResponse;
			// the signed URL sends Content-Disposition: attachment, so this downloads without leaving the page
			window.location.assign(url);
		} catch {
			toaster.error({ title: "Couldn't start the download", description: 'Check your connection and try again.' });
		} finally {
			downloading = null;
		}
	};
</script>

<div class="mx-auto max-w-[960px]">
	<a href="/videos" class="anchor mb-3 inline-flex min-h-11 items-center gap-1.5 text-sm font-medium">
		<ArrowLeft class="size-4" strokeWidth={1.8} aria-hidden="true" /> Videos
	</a>

	<div class="mb-4">
		<p class="eyebrow">Swing</p>
		<h1 class="h1 break-words">{displayTitle(video)}</h1>
		<p class="mt-1 text-surface-600-400">
			<time datetime={video.createdAt}>{formatDate(video.createdAt)}</time>
			{#if duration}<span aria-hidden="true">{' · '}</span><span class="sr-only">{', length '}</span>{duration}{/if}
			{#if video.width && video.height}<span aria-hidden="true">{' · '}</span>{video.width}×{video.height}{/if}
			{#if video.fps}<span aria-hidden="true">{' · '}</span>{Math.round(video.fps * 100) / 100} fps{/if}
		</p>
	</div>

	{#if playback && video.fps && video.width && video.height && video.durationMs}
		<AnnotatedPlayer
			videoId={video.id}
			width={video.width}
			height={video.height}
			fps={video.fps}
			durationMs={video.durationMs}
			source={toSource(playback)}
			{refreshSource}
			poster={playback.video.posterUrl}
			label={displayTitle(video)}
			canEdit={canAnnotate}
			{apiBase}
		/>

		<div class="mt-4 flex flex-wrap items-center gap-3">
			<button type="button" class="btn min-h-12 preset-filled-primary-500" disabled={!online.current || downloading !== null} onclick={() => download('processed')}>
				{#if downloading === 'processed'}<LoaderCircle class="size-5 motion-safe:animate-spin" strokeWidth={1.8} aria-hidden="true" />{:else}<Download class="size-5" strokeWidth={1.8} aria-hidden="true" />{/if}
				Download MP4
			</button>
			<button type="button" class="btn min-h-12 preset-outlined-surface-300-700" disabled={!online.current || downloading !== null} onclick={() => download('original')}>
				{#if downloading === 'original'}<LoaderCircle class="size-5 motion-safe:animate-spin" strokeWidth={1.8} aria-hidden="true" />{:else}<Download class="size-5" strokeWidth={1.8} aria-hidden="true" />{/if}
				Download original
			</button>
		</div>
		<p class="mt-3 text-sm text-surface-600-400">
			Use the arrow keys (or the step buttons) to move one frame at a time. Hold Shift for one second.
		</p>
	{:else if video.status === 'processing' || video.status === 'uploaded'}
		<div class="flex flex-col items-center gap-3 rounded-container border border-surface-300-700 bg-surface-100-900 px-6 py-14 text-center" role="status">
			<LoaderCircle class="size-8 text-primary-500 motion-safe:animate-spin dark:text-primary-200" strokeWidth={1.8} aria-hidden="true" />
			<p class="font-display text-lg font-bold text-secondary-500 dark:text-secondary-100">{chip.label}</p>
			<p class="text-surface-600-400">{chip.note}</p>
		</div>
	{:else}
		<div class="flex flex-col items-center gap-3 rounded-container border border-surface-300-700 bg-surface-100-900 px-6 py-14 text-center">
			<p class="font-display text-lg font-bold text-secondary-500 dark:text-secondary-100">{chip.label}</p>
			<p class="text-surface-600-400">{chip.note ?? 'This video is not available.'}</p>
			{#if video.status === 'failed'}<a href="/videos/new" class="btn min-h-12 preset-filled-tertiary-500">Upload again</a>{/if}
		</div>
	{/if}
</div>
