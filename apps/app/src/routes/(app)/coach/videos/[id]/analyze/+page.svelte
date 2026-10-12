<script lang="ts">
	import AnalyzePage from '#lib/analysis/AnalyzePage.svelte';

	let { data } = $props();
</script>

<svelte:head><title>Analysis | Trey Thornock Golf</title></svelte:head>

<AnalyzePage video={data.video} playback={data.playback} analysisId={data.analysisId} />
