<script lang="ts">
	import Download from '@lucide/svelte/icons/download';
	import type { ExportDto } from '@ttg/shared';
	import { onDestroy, onMount } from 'svelte';
	import { analysisApi } from './analysis-client';

	/**
	 * One MP4 with the video, the drawings and the commentary mixed in, for sharing outside the app. Made by the worker
	 * on request, so this asks, then checks back until it is ready.
	 */
	interface Props {
		analysisId: string;
		apiBase?: string;
		/** Milliseconds between checks while it is being made. */
		pollMs?: number;
	}
	let { analysisId, apiBase = '/api', pollMs = 4000 }: Props = $props();

	const api = $derived(analysisApi(apiBase));
	let exp = $state<ExportDto | null>(null);
	let busy = $state(false);
	let error = $state<string | null>(null);
	let timer: ReturnType<typeof setTimeout> | undefined;

	const working = $derived(exp?.status === 'queued' || exp?.status === 'processing');
	const sizeLabel = (bytes: number | null) => (bytes ? `${(bytes / 1_048_576).toFixed(bytes < 10_485_760 ? 1 : 0)} MB` : '');

	const refresh = async () => {
		try {
			exp = await api.getExport(analysisId);
			error = null;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Could not check the export';
		}
		clearTimeout(timer);
		if (working) timer = setTimeout(refresh, pollMs);
	};
	const start = async () => {
		busy = true;
		error = null;
		try {
			exp = await api.requestExport(analysisId);
			clearTimeout(timer);
			timer = setTimeout(refresh, pollMs);
		} catch (e) {
			error = e instanceof Error ? e.message : 'Could not start the export';
		} finally {
			busy = false;
		}
	};

	onMount(refresh);
	onDestroy(() => clearTimeout(timer));
</script>

<section class="rounded-container border border-surface-300-700 bg-surface-100-900 p-4" aria-label="Export" data-export>
	<div class="flex flex-wrap items-center justify-between gap-3">
		<div class="min-w-0 flex-1">
			<h2 class="font-display text-base font-bold text-secondary-500 dark:text-secondary-100">Export as one video</h2>
			<p class="text-sm text-surface-600-400" role="status">
				{#if working}
					Putting it together. This takes a minute or two; you can leave this page.
				{:else if exp?.status === 'ready'}
					Ready{exp.sizeBytes ? ` (${sizeLabel(exp.sizeBytes)})` : ''}. Earlier changes are not in it if you recorded or drew since.
				{:else if exp?.status === 'failed'}
					That did not work. Try again.
				{:else}
					A single MP4 with your drawings and voice, to send or keep. Camera pictures are not included.
				{/if}
			</p>
			{#if error}<p class="text-sm text-error-600-400" role="alert">{error}</p>{/if}
		</div>
		<div class="flex flex-wrap gap-2">
			{#if exp?.status === 'ready' && exp.download}
				<a href={exp.download.url} class="btn min-h-11 preset-filled-primary-500" download={exp.download.filename} data-export-download>
					<Download class="size-4" strokeWidth={1.8} aria-hidden="true" /> Download
				</a>
			{/if}
			<button type="button" class="btn min-h-11 preset-outlined-surface-300-700" disabled={busy || working} onclick={start} data-export-start>
				{exp?.status === 'ready' ? 'Make a new one' : exp?.status === 'failed' ? 'Try again' : 'Export'}
			</button>
		</div>
	</div>
</section>
