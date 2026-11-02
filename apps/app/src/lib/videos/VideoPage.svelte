<script lang="ts">
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import GitCompareArrows from '@lucide/svelte/icons/git-compare-arrows';
	import Download from '@lucide/svelte/icons/download';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import type { PlaybackSource } from '@ttg/ui';
	import type { AnalysisViewDto, DownloadResponse, PlaybackResponse, VideoDto } from '@ttg/shared';
	import AnalysisOpened from '#lib/analysis/AnalysisOpened.svelte';
	import type { VideoThreadData } from '#lib/chat/chat-client';
	import ChatThread from '#lib/chat/ChatThread.svelte';
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
		/**
		 * The chat about this video, under the player: the player and their coach write here (only messages tied to this
		 * video). Null shows nothing (a reference clip or a preview); `{ noCoach: true }` a note that it opens once the
		 * player has a coach.
		 */
		thread?: VideoThreadData | { noCoach: true } | null;
		/** A coach's view: has the player opened the analysis ("Opened by Sam ..." / "Not opened yet"). Null for players. */
		analysisView?: AnalysisViewDto | null;
		/**
		 * Set for the owning player: the analyses on this page (commentary, comparison) count as opened when the page is
		 * shown. A coach's preview never sets it.
		 */
		recordOpened?: boolean;
	}
	let { video, playback, refresh, apiBase = '/api', canAnnotate = false, comparisonAnalysisId = null, commentaryAnalysisId = null, analyzeBase = `/coach/videos/${video.id}/analyze`, compareBase = '/compare', startMs = null, thread = null, analysisView = null, recordOpened = false }: Props = $props();

	// not reactive on purpose: read when a message is stamped with the current time
	let nowMs = 0;
	let annotated = $state<ReturnType<typeof AnnotatedPlayer>>();
	let playerBox = $state<HTMLElement>();
	/** A time chip in the thread was tapped: move the player there, and bring it into view if it scrolled away. */
	const seekTo = (ms: number) => {
		annotated?.getVideoPlayer()?.seekMs(ms);
		const r = playerBox?.getBoundingClientRect();
		if (r && (r.top < 0 || r.bottom > innerHeight)) playerBox?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
	};
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

	// The player opened the coach's commentary: tell the server once the page is on screen (never from a preload or a
	// hidden tab, and never for a coach). The server ignores anyone but the video's owner and drafts.
	let openedSent = false;
	$effect(() => {
		const id = commentaryAnalysisId;
		if (!recordOpened || !id || openedSent) return;
		const send = () => {
			if (openedSent || document.visibilityState !== 'visible') return;
			openedSent = true;
			void fetch(`${apiBase}/analyses/${id}/view`, { method: 'POST' }).catch(() => (openedSent = false));
		};
		send();
		document.addEventListener('visibilitychange', send);
		return () => document.removeEventListener('visibilitychange', send);
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
	<!-- A coach has no video list (it would redirect to the dashboard), so their way back is the dashboard. -->
	<a href={canAnnotate ? '/coach' : '/videos'} class="anchor mb-3 inline-flex min-h-11 items-center gap-1.5 text-sm font-medium" data-back>
		<ArrowLeft class="size-4" strokeWidth={1.8} aria-hidden="true" /> {canAnnotate ? 'Dashboard' : 'Videos'}
	</a>

	<div class="mb-4 flex items-start justify-between gap-3">
		<div class="min-w-0">
		<p class="eyebrow">{video.kind === 'reference' ? 'Reference' : 'Swing'}</p>
		<h1 class="h1 break-words">{displayTitle(video)}</h1>
		<p class="mt-1 text-surface-600-400">
			<time datetime={video.createdAt}>{formatDate(video.createdAt)}</time>
			{#if duration}<span aria-hidden="true">{' · '}</span><span class="sr-only">{', length '}</span>{duration}{/if}
		</p>
		{#if analysisView}<AnalysisOpened videoId={video.id} view={analysisView} {apiBase} />{/if}
		</div>
		{#if video.status === 'ready' && playback}
			<a href="{compareBase}?{video.kind === 'reference' ? 'b' : 'a'}={video.id}" class="btn mt-1 min-h-12 shrink-0 preset-filled-secondary-500" data-compare-button>
				<GitCompareArrows class="size-5" strokeWidth={1.8} aria-hidden="true" /> Compare
			</a>
		{/if}
	</div>

	{#if playback && video.fps && video.width && video.height && video.durationMs}
		<div bind:this={playerBox} class="scroll-mt-16">
		<AnnotatedPlayer
			bind:this={annotated}
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
		</div>

		{#if thread && 'noCoach' in thread}
			<section class="mt-4 rounded-container border border-dashed border-surface-300-700 bg-surface-100-900 p-4 text-center" aria-label="Messages about this video" data-video-chat-empty>
				<h2 class="font-display text-lg font-bold text-secondary-500 dark:text-secondary-100">Messages about this video</h2>
				<p class="mt-1 text-surface-600-400">You can message your coach about this video here once you are working with a coach.</p>
			</section>
		{:else if thread}
			<div class="mt-4" data-video-chat>
				<ChatThread
					conversation={thread.conversation}
					messages={thread.messages}
					hasMore={thread.hasMore}
					me={thread.me}
					compose={thread.compose}
					scope={{ videoId: video.id }}
					getPlayheadMs={() => nowMs}
					onSeek={seekTo}
					{apiBase}
					backHref={null}
				/>
			</div>
		{/if}

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
			{#if canAnnotate && video.kind !== 'reference'}
				<a href={analyzeBase} class="btn min-h-12 preset-filled-primary-500">Record analysis</a>
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
			{#if video.status === 'failed'}<a href="/videos?upload=1" class="btn min-h-12 preset-filled-tertiary-500">Upload again</a>{/if}
		</div>
	{/if}
</div>
