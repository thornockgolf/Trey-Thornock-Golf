<script lang="ts">
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import type { PlaybackResponse, VideoDto } from '@ttg/shared';
	import type { PlaybackSource } from '@ttg/ui';
	import AnnotatedPlayer from '#lib/videos/AnnotatedPlayer.svelte';
	import { displayTitle } from '#lib/videos/library';
	import AnalysisRecorder from './AnalysisRecorder.svelte';
	import ExportPanel from './ExportPanel.svelte';

	interface Props {
		video: VideoDto;
		/** Null while the video is still processing. */
		playback: PlaybackResponse | null;
		analysisId: string | null;
		/** `/api` in the app, a mock path in dev previews. */
		apiBase?: string;
		/** Where the video's own page is. */
		videoHref?: string;
	}
	let { video, playback, analysisId: initialAnalysisId, apiBase = '/api', videoHref = `/videos/${video.id}` }: Props = $props();

	// svelte-ignore state_referenced_locally
	let analysisId = $state<string | null>(initialAnalysisId);
	let currentMs = $state(0);
	let annotated = $state<ReturnType<typeof AnnotatedPlayer>>();

	const toSource = (p: PlaybackResponse): PlaybackSource => ({ url: p.url, expiresAt: p.expiresAt, spriteUrl: p.spriteUrl, spriteVttUrl: p.spriteVttUrl });
	const refreshSource = async (): Promise<PlaybackSource> => {
		const res = await fetch(`${apiBase}/videos/${video.id}/playback`, { headers: { accept: 'application/json' } });
		if (!res.ok) throw new Error(`playback ${res.status}`);
		return toSource((await res.json()) as PlaybackResponse);
	};
</script>

<div class="mx-auto max-w-[960px]">
	<a href={videoHref} class="anchor mb-3 inline-flex min-h-11 items-center gap-1.5 text-sm font-medium">
		<ArrowLeft class="size-4" strokeWidth={1.8} aria-hidden="true" /> Back to the video
	</a>
	<div class="mb-4">
		<p class="eyebrow">Analysis</p>
		<h1 class="h1 break-words">{displayTitle(video)}</h1>
		<p class="mt-1 text-surface-600-400">Talk over the swing. Your recordings play with the video for the player. Re-record any part without losing the rest.</p>
	</div>

	{#if playback && video.fps && video.width && video.height && video.durationMs}
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
			canEdit={true}
			{apiBase}
			{analysisId}
			onTime={(ms) => (currentMs = ms)}
		/>
		<div class="mt-4">
			<AnalysisRecorder
				videoId={video.id}
				durationMs={video.durationMs}
				{analysisId}
				getPlayer={() => annotated?.getVideoPlayer()}
				{currentMs}
				{apiBase}
				onAnalysis={(id) => (analysisId = id)}
				onChanged={() => {
					void annotated?.reloadCommentary();
					void annotated?.reloadAnnotations();
				}}
			/>
		</div>
		{#if analysisId}
			<div class="mt-4">
				<ExportPanel {analysisId} {apiBase} />
			</div>
		{/if}
	{:else}
		<p class="rounded-container border border-surface-300-700 bg-surface-100-900 p-6 text-center text-surface-600-400" role="status">
			This video is still being processed. Come back when it shows as Ready.
		</p>
	{/if}
</div>
