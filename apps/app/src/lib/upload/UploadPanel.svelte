<script lang="ts">
	import { onDestroy } from 'svelte';
	import { Progress } from '@skeletonlabs/skeleton-svelte';
	import Camera from '@lucide/svelte/icons/camera';
	import CircleAlert from '@lucide/svelte/icons/circle-alert';
	import CircleCheck from '@lucide/svelte/icons/circle-check';
	import Film from '@lucide/svelte/icons/film';
	import Pause from '@lucide/svelte/icons/pause';
	import Play from '@lucide/svelte/icons/play';
	import RotateCcw from '@lucide/svelte/icons/rotate-ccw';
	import Upload from '@lucide/svelte/icons/upload';
	import WifiOff from '@lucide/svelte/icons/wifi-off';
	import X from '@lucide/svelte/icons/x';
	import { MAX_VIDEO_BYTES } from '@ttg/shared';
	import { online } from '#lib/online.svelte';
	import { ACCEPT_ATTR, etaSeconds, formatBytes, formatEta, formatSpeed } from './upload-logic';
	import { UploadStore } from './upload-store.svelte';

	let {
		store: given,
		libraryHref = '/videos',
		/** Dev previews pin the network state; the app follows the browser. */
		forceOffline = false,
		/** A coach's reference clip: the title is required and the copy says so. */
		reference = false
	}: { store?: UploadStore; libraryHref?: string; forceOffline?: boolean; reference?: boolean } = $props();

	// one store (and Uppy instance) per panel unless the page passes its own
	// svelte-ignore state_referenced_locally
	const store = given ?? new UploadStore();
	// svelte-ignore state_referenced_locally
	const owned = !given;
	onDestroy(() => owned && store.destroy());

	const isOnline = $derived(online.current && !forceOffline);
	$effect(() => store.setOnline(isOnline));

	const s = $derived(store.state);
	const file = $derived('file' in s ? s.file : null);
	const progress = $derived('progress' in s ? s.progress : null);
	const showPicker = $derived(s.kind === 'idle' || (s.kind === 'error' && s.stage === 'validation'));
	const offlineTitle = 'Unavailable while offline';
	const noun = $derived(reference ? 'reference' : 'swing');
	const needsTitle = $derived(reference && store.title.trim().length === 0);

	let chooseInput: HTMLInputElement | undefined = $state();
	let captureInput: HTMLInputElement | undefined = $state();
	let dragging = $state(false);

	const onFiles = (e: Event) => {
		const input = e.currentTarget as HTMLInputElement;
		const f = input.files?.[0];
		if (f) store.pick(f);
		input.value = ''; // picking the same file again still fires change
	};
	const onDrop = (e: DragEvent) => {
		e.preventDefault();
		dragging = false;
		const f = e.dataTransfer?.files?.[0];
		if (f && isOnline && !store.busy) store.pick(f);
	};

	// Screen reader announcements: state changes, and progress every 10% (not every event).
	let announcement = $state('');
	let lastKind = '';
	let lastDecile = -1;
	$effect(() => {
		const kind = s.kind;
		const decile = progress ? Math.floor(progress.percent / 10) : -1;
		if (kind === lastKind && (kind !== 'uploading' || decile === lastDecile)) return;
		lastKind = kind;
		lastDecile = decile;
		announcement =
			kind === 'selected' ? `${s.kind === 'selected' ? s.file.name : ''} selected. Ready to upload.`
			: kind === 'uploading' ? `Uploading, ${progress?.percent ?? 0} percent.`
			: kind === 'paused' ? (s.kind === 'paused' && s.reason === 'offline' ? 'Upload paused until you reconnect.' : 'Upload paused.')
			: kind === 'finalizing' ? 'Upload sent. Confirming it arrived.'
			: kind === 'success' ? 'Upload complete. Your video is being processed.'
			: kind === 'error' && s.kind === 'error' ? `Upload problem: ${s.message}`
			: '';
	});
</script>

<section class="card surface-raised border border-surface-200-800 rounded-container p-5 md:p-7" aria-labelledby="upload-heading" aria-busy={store.busy}>
	<h2 id="upload-heading" class="sr-only">Upload a {noun} video</h2>
	<p class="sr-only" role="status" aria-live="polite" aria-atomic="true">{announcement}</p>

	{#if s.kind === 'success'}
		<div class="flex flex-col items-center gap-4 py-6 text-center">
			<span class="flex size-14 items-center justify-center rounded-full preset-tonal-success">
				<CircleCheck class="size-7" strokeWidth={1.8} aria-hidden="true" />
			</span>
			<div>
				<p class="font-display text-xl font-bold text-secondary-500 dark:text-secondary-100">Upload complete</p>
				<p class="mt-1 text-surface-600-400">
					<span class="font-medium text-surface-700-300 break-all">{s.file.name}</span> arrived. We're getting it ready to play; it will show as Ready in the library in a minute or two.
				</p>
			</div>
			<div class="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
				<a href={libraryHref} class="btn min-h-12 preset-filled-tertiary-500">View in library</a>
				<button type="button" class="btn min-h-12 preset-outlined-secondary-500" onclick={store.reset}>Upload another</button>
			</div>
		</div>
	{:else}
		<div class="space-y-5">
			<label class="label">
				<span class="label-text font-display font-semibold text-surface-700-300">Title <span class="font-body font-normal text-surface-600-400">{reference ? '(required)' : '(optional)'}</span></span>
				<input
					class="input min-h-12 text-base"
					type="text"
					maxlength="120"
					placeholder={reference ? 'e.g. Pro driver, face on' : 'e.g. Driver, face on'}
					required={reference}
					autocomplete="off"
					bind:value={store.title}
					disabled={store.busy || (s.kind === 'error' && s.stage !== 'validation')}
				/>
			</label>

			{#if showPicker}
				<!-- Drop zone: the buttons inside are the keyboard and touch path; dropping is a bonus -->
				<div
					role="group"
					aria-label="Choose a video"
					class="flex flex-col items-center gap-4 rounded-container border-2 border-dashed px-4 py-8 text-center transition-colors md:py-12
						{dragging ? 'border-primary-500 bg-primary-50-950' : 'border-surface-300-700 bg-surface-100-900'}
						{isOnline ? '' : 'opacity-60'}"
					ondragover={(e) => {
						e.preventDefault();
						if (isOnline) dragging = true;
					}}
					ondragleave={() => (dragging = false)}
					ondrop={onDrop}
				>
					<span class="flex size-14 items-center justify-center rounded-[14px] surface-raised text-primary-500 dark:text-primary-200">
						<Film class="size-7" strokeWidth={1.8} aria-hidden="true" />
					</span>
					<div>
						<p class="font-display font-semibold text-secondary-500 dark:text-secondary-100">
							<span class="hidden md:pointer-fine:inline">Drag a {noun} video here, or</span>
							<span class="md:pointer-fine:hidden">Pick a {noun} video{reference ? '' : ' or record one'}</span>
						</p>
						<p id="upload-hint" class="mt-1 text-sm text-surface-600-400">MP4, MOV or WebM, up to {formatBytes(MAX_VIDEO_BYTES)} and 5 minutes.</p>
					</div>
					<div class="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
						<button
							type="button"
							class="btn min-h-12 preset-filled-primary-500"
							disabled={!isOnline}
							title={isOnline ? undefined : offlineTitle}
							aria-describedby="upload-hint"
							onclick={() => chooseInput?.click()}
						>
							<Upload class="size-5" strokeWidth={1.8} aria-hidden="true" /> Choose video
						</button>
						{#if !reference}
							<!-- Camera capture matters on phones and tablets; desktop browsers ignore the attribute, so hide it there -->
							<button
								type="button"
								class="btn min-h-12 preset-outlined-secondary-500 md:pointer-fine:hidden"
								disabled={!isOnline}
								title={isOnline ? undefined : offlineTitle}
								onclick={() => captureInput?.click()}
							>
								<Camera class="size-5" strokeWidth={1.8} aria-hidden="true" /> Record a swing
							</button>
						{/if}
					</div>
					<input bind:this={chooseInput} type="file" accept={ACCEPT_ATTR} class="sr-only" tabindex="-1" aria-hidden="true" onchange={onFiles} />
					<input bind:this={captureInput} type="file" accept="video/*" capture="environment" class="sr-only" tabindex="-1" aria-hidden="true" onchange={onFiles} />
				</div>
			{/if}

			{#if file && !showPicker}
				<div class="flex items-center gap-3 rounded-base border border-surface-200-800 bg-surface-100-900 p-3">
					<span class="flex size-11 shrink-0 items-center justify-center rounded-[12px] surface-raised text-primary-500 dark:text-primary-200">
						<Film class="size-5" strokeWidth={1.8} aria-hidden="true" />
					</span>
					<div class="min-w-0 flex-1">
						<p class="truncate font-medium text-surface-700-300" title={file.name}>{file.name}</p>
						<p class="text-sm text-surface-600-400">{formatBytes(file.sizeBytes)}</p>
					</div>
					{#if s.kind === 'selected'}
						<button type="button" class="btn min-h-12 preset-tonal-primary" onclick={store.reset}>Change</button>
					{/if}
				</div>
			{/if}

			{#if s.kind === 'uploading' || s.kind === 'paused' || s.kind === 'finalizing' || (s.kind === 'error' && progress)}
				{@const value = s.kind === 'finalizing' ? null : (progress?.percent ?? 0)}
				<Progress {value} max={100} class="w-full space-y-2">
					<div class="flex items-baseline justify-between gap-3 text-sm">
						<Progress.Label class="font-display font-semibold text-surface-700-300">
							{#if s.kind === 'uploading'}Uploading{:else if s.kind === 'paused'}{s.reason === 'offline' ? 'Paused: waiting for a connection' : 'Paused'}{:else if s.kind === 'finalizing'}Confirming your upload…{:else}Stopped{/if}
						</Progress.Label>
						{#if value !== null}<Progress.ValueText class="font-display font-semibold tabular-nums text-surface-700-300" />{/if}
					</div>
					<Progress.Track class="h-2 rounded-full bg-surface-200-800">
						<Progress.Range class="rounded-full bg-primary-500 dark:bg-primary-300" />
					</Progress.Track>
				</Progress>
				{#if progress && s.kind !== 'finalizing'}
					<p class="-mt-2 text-sm text-surface-600-400 tabular-nums">
						{[`${formatBytes(progress.bytesUploaded)} of ${formatBytes(progress.bytesTotal)}`, s.kind === 'uploading' ? formatSpeed(progress.speedBps) : '', s.kind === 'uploading' ? formatEta(etaSeconds(progress)) : ''].filter(Boolean).join(' · ')}
					</p>
				{/if}
			{/if}

			{#if s.kind === 'error'}
				<div role="alert" class="flex gap-3 rounded-base border border-error-200-800 bg-error-50-950 p-4 text-error-700-300">
					<CircleAlert class="mt-0.5 size-5 shrink-0" strokeWidth={1.8} aria-hidden="true" />
					<p>{s.message}</p>
				</div>
			{/if}

			{#if !isOnline && !store.busy}
				<p class="flex items-center gap-2 text-sm text-surface-600-400">
					<WifiOff class="size-4 shrink-0" strokeWidth={1.8} aria-hidden="true" /> You're offline. Uploading is paused until you reconnect.
				</p>
			{/if}

			<!-- Actions -->
			{#if s.kind === 'selected'}
				<div class="flex flex-col gap-3 sm:flex-row">
					<button type="button" class="btn min-h-12 preset-filled-tertiary-500" onclick={store.start} disabled={!isOnline || needsTitle} title={isOnline ? (needsTitle ? 'Give the video a title first' : undefined) : offlineTitle}>
						<Upload class="size-5" strokeWidth={1.8} aria-hidden="true" /> Upload video
					</button>
				</div>
			{:else if s.kind === 'uploading' || s.kind === 'paused' || s.kind === 'finalizing'}
				<div class="flex flex-col gap-3 sm:flex-row">
					{#if s.kind === 'uploading'}
						<button type="button" class="btn min-h-12 preset-outlined-secondary-500" onclick={store.pause}>
							<Pause class="size-5" strokeWidth={1.8} aria-hidden="true" /> Pause
						</button>
					{:else if s.kind === 'paused'}
						<button type="button" class="btn min-h-12 preset-filled-primary-500" onclick={store.resume} disabled={!isOnline} title={isOnline ? undefined : offlineTitle}>
							<Play class="size-5" strokeWidth={1.8} aria-hidden="true" /> Resume
						</button>
					{/if}
					<button type="button" class="btn min-h-12 preset-tonal-error" onclick={store.cancel}>
						<X class="size-5" strokeWidth={1.8} aria-hidden="true" /> Cancel
					</button>
				</div>
			{:else if s.kind === 'error' && s.stage !== 'validation'}
				<div class="flex flex-col gap-3 sm:flex-row">
					<button type="button" class="btn min-h-12 preset-filled-primary-500" onclick={store.retry} disabled={!isOnline} title={isOnline ? undefined : offlineTitle}>
						<RotateCcw class="size-5" strokeWidth={1.8} aria-hidden="true" /> Retry
					</button>
					{#if s.stage === 'complete'}
						<button type="button" class="btn min-h-12 preset-outlined-secondary-500" onclick={store.startOver} disabled={!isOnline}>Upload again</button>
					{/if}
					<button type="button" class="btn min-h-12 preset-tonal-error" onclick={store.cancel}>
						<X class="size-5" strokeWidth={1.8} aria-hidden="true" /> Cancel
					</button>
				</div>
			{/if}
		</div>
	{/if}
</section>
