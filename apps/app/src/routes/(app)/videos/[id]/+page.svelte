<script lang="ts">
	import { invalidate } from '$app/navigation';
	import VideoPage from '#lib/videos/VideoPage.svelte';

	let { data } = $props();
</script>

<svelte:head><title>{data.video.title ?? 'Swing video'} | Trey Thornock Golf</title></svelte:head>

<VideoPage video={data.video} playback={data.playback} refresh={() => invalidate('app:video')} canAnnotate={data.user.role === 'coach'} />
