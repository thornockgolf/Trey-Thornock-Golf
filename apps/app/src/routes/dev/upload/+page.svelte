<script lang="ts">
	import AppShell from '#lib/components/AppShell.svelte';
	import UploadPage from '#lib/upload/UploadPage.svelte';
	import { UploadStore } from '#lib/upload/upload-store.svelte';
	import type { FileInfo, UploadState } from '#lib/upload/upload-logic';
	import type { Transport } from '#lib/upload/transport';
	import type { VideoDto } from '@ttg/shared';

	let { data } = $props();

	const file: FileInfo = { name: 'IMG_4821 driver face-on.mov', sizeBytes: 182 * 1024 * 1024, contentType: 'video/quicktime' };
	const p = (pct: number, speed: number | null = 2.4 * 1024 * 1024) => ({
		bytesUploaded: Math.round((file.sizeBytes * pct) / 100),
		bytesTotal: file.sizeBytes,
		percent: pct,
		speedBps: speed
	});
	const fixed: Record<string, UploadState> = {
		idle: { kind: 'idle' },
		offline: { kind: 'idle' },
		selected: { kind: 'selected', file },
		uploading: { kind: 'uploading', file, progress: p(40) },
		paused: { kind: 'paused', file, progress: p(40, null), reason: 'user' },
		'paused-offline': { kind: 'paused', file, progress: p(40, null), reason: 'offline' },
		finalizing: { kind: 'finalizing', file },
		error: { kind: 'error', file, stage: 'upload', message: 'Your connection dropped. Check it and press Retry; uploaded parts are kept.', progress: p(40, null) },
		'complete-error': { kind: 'error', file, stage: 'complete', message: "We couldn't confirm the video arrived. Press Retry; if it keeps failing, start the upload again.", progress: null },
		invalid: { kind: 'error', file: null, stage: 'validation', message: '"notes.pdf" isn\'t a supported video. Use an MP4, MOV or WebM file.', progress: null },
		success: { kind: 'success', file, video: { id: 'x', status: 'uploaded' } as VideoDto }
	};

	// static states never touch the network
	const inert = new Proxy({}, { get: () => () => new Promise(() => {}) }) as Transport;

	// svelte-ignore state_referenced_locally
	const store = data.state === 'live' ? new UploadStore({ apiBase: '/dev/mock-api' }) : new UploadStore({ transport: inert, initialState: fixed[data.state] });
</script>

<AppShell role={data.role} pathname="/videos/new">
	<nav class="mb-6 flex flex-wrap gap-2 text-xs" aria-label="Preview states">
		{#each data.states as st (st)}
			<a class="chip {st === data.state ? 'preset-filled-secondary-500' : 'preset-tonal-surface'}" href="?state={st}&role={data.role}" data-sveltekit-reload>{st}</a>
		{/each}
	</nav>
	<UploadPage {store} forceOffline={data.state === 'offline' || data.state === 'paused-offline'} />
</AppShell>
