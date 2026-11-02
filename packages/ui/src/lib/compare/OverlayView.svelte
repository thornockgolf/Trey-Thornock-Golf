<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import Play from '@lucide/svelte/icons/play';
	import Pause from '@lucide/svelte/icons/pause';
	import RotateCcw from '@lucide/svelte/icons/rotate-ccw';
	import type { OverlaySettings } from '@ttg/shared';
	import VideoPlayer from '../player/VideoPlayer.svelte';
	import { formatClock } from '../player/player-logic';
	import type { CompareVideo } from './CompareView.svelte';

	interface Props {
		base: CompareVideo;
		/** The video laid over the base one. */
		over: CompareVideo;
		/** Opacity, scale and position. The sync-point fields and `overlayVideoId` are the caller's business (the page keeps them as stored). */
		settings: OverlaySettings;
	}
	let { base, over, settings = $bindable() }: Props = $props();

	let overlayEl = $state<HTMLVideoElement>();
	let frame = $state({ w: 0, h: 0 });
	let frameBox = $state<HTMLDivElement>();
	let src = $state(untrack(() => over.source.url));

	// The overlay video has its own transport: nothing links it to the main video.
	const RATES = [0.25, 0.5, 0.75, 1];
	let ovPlaying = $state(false);
	let ovMs = $state(0);
	let ovDur = $state(untrack(() => over.durationMs ?? 0));
	let ovRate = $state(1);
	const ovDuration = $derived(ovDur || over.durationMs || 0);

	onMount(() => {
		if (!overlayEl) return;
		const el = overlayEl;
		const upd = () => (ovMs = Math.round(el.currentTime * 1000));
		const meta = () => Number.isFinite(el.duration) && (ovDur = Math.round(el.duration * 1000));
		const state = () => (ovPlaying = !el.paused && !el.ended);
		const evs: [string, () => unknown][] = [['timeupdate', upd], ['seeked', upd], ['loadedmetadata', meta], ['durationchange', meta], ['play', state], ['pause', state], ['ended', state]];
		for (const [e, h] of evs) el.addEventListener(e, h);
		meta();
		const ro = new ResizeObserver(([e]) => (frame = { w: e!.contentRect.width, h: e!.contentRect.height }));
		if (frameBox) ro.observe(frameBox);
		return () => {
			for (const [e, h] of evs) el.removeEventListener(e, h);
			ro.disconnect();
		};
	});

	const togglePlay = () => {
		if (!overlayEl) return;
		if (overlayEl.paused) {
			if (overlayEl.ended) overlayEl.currentTime = 0;
			void overlayEl.play().catch(() => {});
		} else overlayEl.pause();
	};
	const setRate = (r: number) => {
		ovRate = r;
		if (overlayEl) overlayEl.playbackRate = r;
	};

	// a signed URL that stopped working: fetch a new one and carry on from the same spot
	let refreshing = false;
	const onError = async () => {
		if (!over.refreshSource || refreshing || !overlayEl) return;
		refreshing = true;
		const at = overlayEl.currentTime;
		const wasPlaying = !overlayEl.paused;
		try {
			src = (await over.refreshSource()).url;
			overlayEl.addEventListener(
				'loadedmetadata',
				() => {
					overlayEl!.currentTime = at;
					if (wasPlaying) void overlayEl!.play().catch(() => {});
				},
				{ once: true }
			);
		} catch {
			// leave the overlay as it is; the base video keeps working
		} finally {
			refreshing = false;
		}
	};

	const reset = () => (settings = { ...settings, opacity: 0.5, scale: 1, x: 0, y: 0 });
	const pct = (n: number) => `${Math.round(n * 100)}%`;
</script>

<div class="flex flex-col gap-4" data-overlay>
	<div class="relative">
		<VideoPlayer
			source={base.source}
			refreshSource={base.refreshSource}
			poster={base.poster}
			fps={base.fps}
			durationMs={base.durationMs}
			adaptive
			maxHeight="72dvh"
			label="{base.label}, with {over.label} laid over it"
		>
			{#snippet overlay()}
				<!-- the overlay video sits over the picture; taps still reach the player underneath -->
				<div bind:this={frameBox} class="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden" data-overlay-frame>
					<!-- svelte-ignore a11y_media_has_caption -->
					<video
						bind:this={overlayEl}
						{src}
						muted
						playsinline
						preload="auto"
						aria-hidden="true"
						class="max-h-full max-w-full object-contain"
						style:opacity={settings.opacity}
						style:transform="translate({settings.x * frame.w}px, {settings.y * frame.h}px) scale({settings.scale})"
						data-overlay-video
						onerror={onError}
					></video>
				</div>
			{/snippet}
		</VideoPlayer>
	</div>

	<div class="flex flex-wrap items-center gap-3 rounded-container border border-surface-300-700 bg-surface-100-900 p-3" role="group" aria-label="Overlay video controls: {over.label}" data-overlay-transport>
		<button type="button" class="btn-icon size-12 preset-filled-primary-500" onclick={togglePlay} aria-label={ovPlaying ? 'Pause the overlay video' : 'Play the overlay video'} aria-pressed={ovPlaying} data-overlay-play>
			{#if ovPlaying}<Pause class="size-5" strokeWidth={1.8} aria-hidden="true" />{:else}<Play class="size-5" strokeWidth={1.8} aria-hidden="true" />{/if}
		</button>
		<div class="flex min-w-40 flex-1 flex-col gap-0.5">
			<span class="flex justify-between text-sm">
				<span class="truncate font-display font-semibold text-surface-700-300">Overlay: {over.label}</span>
				<span class="shrink-0 pl-2 text-surface-600-400 tabular-nums">{formatClock(ovMs / 1000)} / {formatClock(ovDuration / 1000)}</span>
			</span>
			<input
				type="range"
				class="h-11 w-full accent-primary-500"
				min="0"
				max={Math.max(ovDuration, 1)}
				step="1"
				value={ovMs}
				aria-label="Overlay video position"
				oninput={(e) => overlayEl && (overlayEl.currentTime = Number(e.currentTarget.value) / 1000)}
				data-overlay-scrub
			/>
		</div>
		<div class="flex gap-1" role="group" aria-label="Overlay video speed">
			{#each RATES as r (r)}
				<button type="button" class="btn min-h-11 min-w-12 px-2 {ovRate === r ? 'preset-filled-primary-500' : 'preset-outlined-surface-300-700'}" aria-pressed={ovRate === r} onclick={() => setRate(r)}>{r}x</button>
			{/each}
		</div>
	</div>

	<div class="grid grid-cols-1 gap-3 rounded-container border border-surface-300-700 bg-surface-100-900 p-4 sm:grid-cols-2" role="group" aria-label="Overlay settings">
		{#each [{ id: 'opacity', label: 'Opacity', min: 0.1, max: 1, step: 0.05 }, { id: 'scale', label: 'Size', min: 0.25, max: 3, step: 0.05 }, { id: 'x', label: 'Left / right', min: -0.5, max: 0.5, step: 0.005 }, { id: 'y', label: 'Up / down', min: -0.5, max: 0.5, step: 0.005 }] as f (f.id)}
			<label class="flex flex-col gap-1 text-sm">
				<span class="flex justify-between">
					<span class="font-display font-semibold text-surface-700-300">{f.label}</span>
					<span class="text-surface-600-400 tabular-nums">{f.id === 'x' || f.id === 'y' ? (settings[f.id] > 0 ? '+' : '') + pct(settings[f.id]) : pct(settings[f.id as 'opacity' | 'scale'])}</span>
				</span>
				<input
					type="range"
					class="h-11 w-full accent-primary-500"
					min={f.min}
					max={f.max}
					step={f.step}
					value={settings[f.id as 'opacity' | 'scale' | 'x' | 'y']}
					oninput={(e) => (settings = { ...settings, [f.id]: Number(e.currentTarget.value) })}
					data-overlay-control={f.id}
				/>
			</label>
		{/each}
		<div class="sm:col-span-2">
			<button type="button" class="btn min-h-11 preset-outlined-surface-300-700" onclick={reset}>
				<RotateCcw class="size-4" strokeWidth={1.8} aria-hidden="true" /> Reset overlay
			</button>
		</div>
	</div>

</div>
