<script lang="ts">
	import { onDestroy } from 'svelte';
	import { Progress } from '@skeletonlabs/skeleton-svelte';
	import CircleAlert from '@lucide/svelte/icons/circle-alert';
	import CircleCheck from '@lucide/svelte/icons/circle-check';
	import Pause from '@lucide/svelte/icons/pause';
	import Play from '@lucide/svelte/icons/play';
	import RotateCcw from '@lucide/svelte/icons/rotate-ccw';
	import X from '@lucide/svelte/icons/x';
	import { online } from '#lib/online.svelte';
	import { PAYMENT_REQUIRED_MESSAGE, etaSeconds, formatBytes, formatEta, formatSpeed } from './upload-logic';
	import { UploadStore } from './upload-store.svelte';

	let {
		store: given,
		apiBase,
		onuploaded,
		billingUrl = '/billing'
	}: {
		store?: UploadStore;
		/** Dev previews point this at the mock API. */
		apiBase?: string;
		/** Called after `/complete` succeeded (the server has the video), e.g. to refresh the list. */
		onuploaded?: () => void;
		billingUrl?: string;
	} = $props();

	// svelte-ignore state_referenced_locally
	const store = given ?? new UploadStore({ apiBase });
	// svelte-ignore state_referenced_locally
	const owned = !given;
	onDestroy(() => owned && store.destroy());
	$effect(() => store.setOnline(online.current));

	const s = $derived(store.state);
	const progress = $derived('progress' in s ? s.progress : null);
	const paymentRequired = $derived(s.kind === 'error' && s.message === PAYMENT_REQUIRED_MESSAGE);

	let input: HTMLInputElement | undefined = $state();

	/** Opens the device's file picker. Must be called from a click handler (browsers need a user gesture). */
	export const open = () => {
		if (!store.busy) input?.click();
	};
	export const busy = () => store.busy;

	const onChange = (e: Event) => {
		const el = e.currentTarget as HTMLInputElement;
		const f = el.files?.[0];
		el.value = ''; // picking the same file again still fires change
		if (!f) return;
		store.pick(f);
		if (store.state.kind === 'selected') store.start(); // no extra confirmation step: choosing the file is the confirmation
	};

	// Tell the page once, and only after the server confirmed (`success` is set by `/complete`).
	let notified = false;
	$effect(() => {
		if (s.kind === 'success' && !notified) {
			notified = true;
			onuploaded?.();
		} else if (s.kind !== 'success') notified = false;
	});

	let announcement = $state('');
	$effect(() => {
		announcement =
			s.kind === 'uploading' ? `Uploading, ${Math.floor((progress?.percent ?? 0) / 10) * 10} percent.`
			: s.kind === 'finalizing' ? 'Upload sent. Confirming it arrived.'
			: s.kind === 'success' ? 'Upload complete. Your video is being processed.'
			: s.kind === 'error' ? `Upload problem: ${s.message}`
			: '';
	});
</script>

<!-- accept="video/*": on phones the picker offers the camera and the photo library; validateFile enforces our types and limits -->
<input bind:this={input} type="file" accept="video/*" class="sr-only" tabindex="-1" aria-hidden="true" onchange={onChange} />
<p class="sr-only" role="status" aria-live="polite" aria-atomic="true">{announcement}</p>

{#if s.kind !== 'idle'}
	<section class="mb-6 rounded-container border border-surface-200-800 surface-raised p-4" aria-label="Video upload" aria-busy={store.busy} data-upload-row>
		{#if 'file' in s && s.file}
			<div class="flex items-center justify-between gap-3">
				<p class="min-w-0 truncate font-medium text-surface-700-300" title={s.file.name}>{s.file.name}</p>
				<span class="shrink-0 text-sm text-surface-600-400 tabular-nums">{formatBytes(s.file.sizeBytes)}</span>
			</div>
		{/if}

		{#if s.kind === 'uploading' || s.kind === 'paused' || s.kind === 'finalizing' || (s.kind === 'error' && progress)}
			{@const value = s.kind === 'finalizing' ? null : (progress?.percent ?? 0)}
			<Progress {value} max={100} class="mt-3 w-full space-y-2">
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
			{#if progress && s.kind === 'uploading'}
				<p class="mt-1 text-sm text-surface-600-400 tabular-nums">
					{[`${formatBytes(progress.bytesUploaded)} of ${formatBytes(progress.bytesTotal)}`, formatSpeed(progress.speedBps), formatEta(etaSeconds(progress))].filter(Boolean).join(' · ')}
				</p>
			{/if}
		{/if}

		{#if s.kind === 'success'}
			<p class="mt-2 flex items-start gap-2 text-success-700-300">
				<CircleCheck class="mt-0.5 size-5 shrink-0" strokeWidth={1.8} aria-hidden="true" />
				<span>Upload complete. It is getting ready to play and will show as Ready in a minute or two.</span>
			</p>
		{/if}

		{#if s.kind === 'error'}
			<div role="alert" class="mt-3 flex gap-3 rounded-base border border-error-200-800 bg-error-50-950 p-3 text-error-700-300">
				<CircleAlert class="mt-0.5 size-5 shrink-0" strokeWidth={1.8} aria-hidden="true" />
				<p class="min-w-0">
					{s.message}
					{#if paymentRequired}<a href={billingUrl} class="anchor font-medium">Go to Billing</a>{/if}
				</p>
			</div>
		{/if}

		<div class="mt-3 flex flex-wrap gap-2">
			{#if s.kind === 'uploading'}
				<button type="button" class="btn min-h-12 preset-outlined-secondary-500" onclick={store.pause}><Pause class="size-5" strokeWidth={1.8} aria-hidden="true" /> Pause</button>
			{:else if s.kind === 'paused'}
				<button type="button" class="btn min-h-12 preset-filled-primary-500" onclick={store.resume} disabled={!online.current}><Play class="size-5" strokeWidth={1.8} aria-hidden="true" /> Resume</button>
			{:else if s.kind === 'error' && s.stage !== 'validation' && !paymentRequired}
				<button type="button" class="btn min-h-12 preset-filled-primary-500" onclick={store.retry} disabled={!online.current}><RotateCcw class="size-5" strokeWidth={1.8} aria-hidden="true" /> Retry</button>
				{#if s.stage === 'complete'}
					<button type="button" class="btn min-h-12 preset-outlined-secondary-500" onclick={store.startOver} disabled={!online.current}>Upload again</button>
				{/if}
			{/if}
			{#if s.kind === 'uploading' || s.kind === 'paused' || s.kind === 'finalizing' || s.kind === 'error'}
				<button type="button" class="btn min-h-12 preset-tonal-error" onclick={store.cancel}><X class="size-5" strokeWidth={1.8} aria-hidden="true" /> {s.kind === 'error' ? 'Dismiss' : 'Cancel'}</button>
			{:else if s.kind === 'success'}
				<button type="button" class="btn min-h-12 preset-tonal-primary" onclick={store.reset}>Dismiss</button>
			{/if}
		</div>
	</section>
{/if}
