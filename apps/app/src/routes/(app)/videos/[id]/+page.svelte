<script lang="ts">
	import { invalidate } from '$app/navigation';
	import { page } from '$app/state';
	import VideoPage from '#lib/videos/VideoPage.svelte';

	let { data } = $props();

	/** `?t=3200`: whole milliseconds from the start, or nothing. */
	const startFrom = (t: string | null) => (t !== null && /^\d{1,9}$/.test(t) ? Number(t) : null);
</script>

<svelte:head><title>{data.video.title ?? 'Swing video'} | Trey Thornock Golf</title></svelte:head>

<VideoPage video={data.video} playback={data.playback} refresh={() => invalidate('app:video')} canAnnotate={data.user.role === 'coach'} comparisonAnalysisId={data.comparisonAnalysisId} commentaryAnalysisId={data.commentaryAnalysisId}
	startMs={startFrom(page.url.searchParams.get('t'))}
	messageHref={data.video.kind === 'reference' ? null : `/messages/new?video=${data.video.id}`}
/>
