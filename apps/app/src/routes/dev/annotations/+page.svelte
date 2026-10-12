<script lang="ts">
	import AppShell from '#lib/components/AppShell.svelte';
	import VideoPage from '#lib/videos/VideoPage.svelte';

	let { data } = $props();
</script>

<svelte:head><title>Annotations preview</title></svelte:head>

<!-- dev preview: the real video page with the annotation layer, talking to the in-memory mock API -->
<AppShell role={data.canAnnotate ? 'coach' : 'player'} pathname="/videos">
	<VideoPage video={data.video} playback={data.playback} refresh={() => {}} apiBase="/dev/mock-api" canAnnotate={data.canAnnotate} />
</AppShell>
