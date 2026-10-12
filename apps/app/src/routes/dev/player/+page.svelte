<script lang="ts">
	import AppShell from '#lib/components/AppShell.svelte';
	import VideoPage from '#lib/videos/VideoPage.svelte';

	let { data } = $props();
</script>

<svelte:head><title>Player preview</title></svelte:head>

<!-- dev preview: the same page component as /videos/[id], talking to the mock API, inside the shell -->
<AppShell role="player" pathname="/videos">
	<VideoPage video={data.video} playback={data.playback} refresh={() => {}} apiBase="/dev/mock-api" commentaryAnalysisId={data.commentary} />
</AppShell>
