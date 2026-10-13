<script lang="ts">
	import ExportPanel from '#lib/analysis/ExportPanel.svelte';
</script>

<svelte:head><title>Export panel preview</title></svelte:head>

<div class="mx-auto max-w-[960px] p-4">
	<ExportPanel analysisId="77777777-7777-4777-8777-777777777777" apiBase="/dev/mock-api" pollMs={500} />
</div>
