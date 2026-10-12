<script lang="ts">
	import AppShell from '#lib/components/AppShell.svelte';
	import AnalyzePage from '#lib/analysis/AnalyzePage.svelte';

	let { data } = $props();
</script>

<svelte:head><title>Analysis recorder preview</title></svelte:head>

<AppShell role="coach" pathname="/videos">
	<AnalyzePage video={data.video} playback={data.playback} analysisId={data.analysisId} apiBase="/dev/mock-api" videoHref="/dev/player" />
</AppShell>
