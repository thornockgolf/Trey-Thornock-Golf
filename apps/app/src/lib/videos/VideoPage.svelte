<script lang="ts">
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import Download from '@lucide/svelte/icons/download';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import type { PlaybackSource } from '@ttg/ui';
	import type { DownloadResponse, PlaybackResponse, VideoDto } from '@ttg/shared';
	import { online } from '#lib/online.svelte';
	import { VIDEO_EVENT, unread } from '#lib/realtime/unread.svelte';
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
		/** The coach's saved overlay comparison for this video, if there is one. */
		comparisonAnalysisId?: string | null;
		/** The newest analysis of this video with a recording: its commentary plays with the video. */
		commentaryAnalysisId?: string | null;
		/** Where a coach records an analysis (the dev preview points at its own page). */
		analyzeBase?: string;
		/** Where Compare lives (the dev preview points at its own page). */
		compareBase?: string;
		/** Open at this time in ms (from a chat message). */
		startMs?: number | null;
		/** Where the chat about this video starts (null hides the button, e.g. in previews). */
		messageHref?: string | null;
	}
	let { video, playback, refresh, apiBase = '/api', canAnnotate = false, comparisonAnalysisId = null, commentaryAnalysisId = null, analyzeBase = `/coach/videos/${video.id}/analyze`, compareBase = '/compare', startMs = null, messageHref = null }: Props = $props();

	// not reactive on purpose: read when the message link is followed
	let nowMs = 0;
	const chip = $derived(statusChip(video.status));
	const duration = $derived(formatDuration(video.durationMs));
	const toSource = (p: PlaybackResponse): PlaybackSource => ({ url: p.url, expiresAt: p.expiresAt, spriteUrl: p.spriteUrl, spriteVttUrl: p.spriteVttUrl });

	// While the video is processing: the `video.ready`/`video.failed` events on the user channel refresh it at once
	// (see AppShell); this poll is the fallback when Realtime is off or the socket is down.
	let visible = $state(true);
	$effect(() => {
		const onVis = () => (visible = document.visibilityState === 'visible');
		onVis();
		document.addEventListener('visibilitychange', onVis);
		return () => document.removeEventListener('visibilitychange', onVis);
	});
	$effect(() => {
		const onEvent = (e: Event) => {
			const id = (e as CustomEvent<{ videoId?: string }>).detail?.videoId;
			if (!id || id === video.id) void refresh();
		};
		window.addEventListener(VIDEO_EVENT, onEvent);
		return () => window.removeEventListener(VIDEO_EVENT, onEvent);
	});
	$effect(() => {
		if (!shouldPoll([video]) || !visible || !online.current || unread.live) return;
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
		<p class="eyebrow">{video.kind === 'reference' ? 'Reference' : 'Swing'}</p>
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
			analysisId={commentaryAnalysisId}
			{startMs}
			onTime={(ms) => (nowMs = ms)}
		/>

		<div class="mt-4 flex flex-wrap items-center gap-3">
			<button type="button" class="btn min-h-12 preset-filled-primary-500" disabled={!online.current || downloading !== null} onclick={() => download('processed')}>
				{#if downloading === 'processed'}<LoaderCircle class="size-5 motion-safe:animate-spin" strokeWidth={1.8} aria-hidden="true" />{:else}<Download class="size-5" strokeWidth={1.8} aria-hidden="true" />{/if}
				Download MP4
			</button>
			{#if video.kind !== 'reference' || canAnnotate}
				<button type="button" class="btn min-h-12 preset-outlined-surface-300-700" disabled={!online.current || downloading !== null} onclick={() => download('original')}>
					{#if downloading === 'original'}<LoaderCircle class="size-5 motion-safe:animate-spin" strokeWidth={1.8} aria-hidden="true" />{:else}<Download class="size-5" strokeWidth={1.8} aria-hidden="true" />{/if}
					Download original
				</button>
			{/if}
		</div>
		<div class="mt-3 flex flex-wrap items-center gap-3">
			<a href="{compareBase}?{video.kind === 'reference' ? 'b' : 'a'}={video.id}" class="btn min-h-12 preset-outlined-secondary-500">Compare with another video</a>
			{#if canAnnotate && video.kind !== 'reference'}
				<a href={analyzeBase} class="btn min-h-12 preset-filled-primary-500">Record analysis</a>
			{/if}
			{#if messageHref}
				<a
					href={messageHref}
					class="btn min-h-12 preset-outlined-secondary-500"
					data-message-about
					onclick={(e) => {
						// carry the playhead: the message points at this moment
						e.preventDefault();
						window.location.assign(`${messageHref}&ms=${Math.round(nowMs)}`);
					}}>{canAnnotate ? 'Message the player' : 'Ask your coach about this'}</a>
			{/if}
			{#if comparisonAnalysisId}
				<a href="{compareBase}?analysis={comparisonAnalysisId}" class="btn min-h-12 preset-filled-tertiary-500">See your coach's comparison</a>
			{/if}
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
