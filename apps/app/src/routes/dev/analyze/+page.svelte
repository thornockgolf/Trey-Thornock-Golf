<script lang="ts">
	import AppShell from '#lib/components/AppShell.svelte';
	import AnalyzePage from '#lib/analysis/AnalyzePage.svelte';

	import { page } from '$app/state';
	import type { AnalysisViewDto } from '@ttg/shared';

	let { data } = $props();
	// ?opened=unpublished|unopened|opened|updated: what the header's "Opened by ..." line says
	let analysisView = $state<AnalysisViewDto | null>(null);
	$effect(() => {
		void fetch('/dev/mock-api/__analysisview', { method: 'POST', body: JSON.stringify({ state: page.url.searchParams.get('opened') ?? 'unopened' }) })
			.then(() => fetch(`/dev/mock-api/videos/${data.video.id}/analysis-view`))
			.then((r) => r.json())
			.then((v) => (analysisView = v));
	});
</script>

<svelte:head><title>Analysis recorder preview</title></svelte:head>

<AppShell role="coach" pathname="/videos">
	<AnalyzePage video={data.video} playback={data.playback} analysisId={data.analysisId} apiBase="/dev/mock-api" videoHref="/dev/player" {analysisView} />
</AppShell>
