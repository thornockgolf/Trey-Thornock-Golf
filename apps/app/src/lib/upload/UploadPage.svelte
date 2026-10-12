<script lang="ts">
	import UploadPanel from './UploadPanel.svelte';
	import type { UploadStore } from './upload-store.svelte';

	let { store, forceOffline = false }: { store?: UploadStore; forceOffline?: boolean } = $props();
</script>

<div class="mx-auto max-w-2xl">
	<p class="eyebrow">Upload</p>
	<h1 class="h1">Upload a swing</h1>
	<p class="mt-2 mb-6 text-surface-600-400">Your video goes straight to secure storage. Keep this page open until it says the upload is complete.</p>
	<UploadPanel {store} {forceOffline} />
</div>
