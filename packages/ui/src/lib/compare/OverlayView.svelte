<script lang="ts">
	import { onDestroy, onMount, untrack } from 'svelte';
	import Link from '@lucide/svelte/icons/link';
	import Unlink from '@lucide/svelte/icons/unlink';
	import RotateCcw from '@lucide/svelte/icons/rotate-ccw';
	import type { OverlaySettings } from '@ttg/shared';
	import VideoPlayer from '../player/VideoPlayer.svelte';
	import type { CompareVideo } from './CompareView.svelte';
	import SyncPointControls from './SyncPointControls.svelte';
	import { SyncController } from './sync';
	import { elementTarget, playerTarget } from './targets';

	interface Props {
		base: CompareVideo;
		/** The video laid over the base one. */
		over: CompareVideo;
		/** Opacity, scale, position and the two sync points. `overlayVideoId` is the caller's business. */
		settings: OverlaySettings;
		/** Keep the overlay playing in step with the base from the sync points (on by default here). */
		sync?: boolean;
	}
	let { base, over, settings = $bindable(), sync = $bindable(true) }: Props = $props();

	let player = $state<ReturnType<typeof VideoPlayer>>();
	let overlayEl = $state<HTMLVideoElement>();
	let frame = $state({ w: 0, h: 0 });
	let frameBox = $state<HTMLDivElement>();
	let baseMs = $state(0);
	let overlayMs = $state(0);
	let src = $state(untrack(() => over.source.url));

	const points = () => ({ a: settings.baseSyncMs, b: settings.overlaySyncMs });
	const frameMs = () => 1000 / Math.min(base.fps || 30, over.fps || 30);

	let controller: SyncController | undefined;
	$effect(() => {
		const p = player?.getPlayer();
		const el = overlayEl;
		if (!sync || !p || !el) return;
		controller = new SyncController(playerTarget(p), elementTarget(el), { points, frameMs });
		controller.start();
		return () => {
			controller?.stop();
			controller = undefined;
		};
	});
	$effect(() => {
		void settings.baseSyncMs;
		void settings.overlaySyncMs;
		untrack(() => controller?.align());
	});

	// the overlay video's own clock, for its "Set to now" button
	onMount(() => {
		if (!overlayEl) return;
		const el = overlayEl;
		const upd = () => (overlayMs = Math.round(el.currentTime * 1000));
		el.addEventListener('timeupdate', upd);
		el.addEventListener('seeked', upd);
		const ro = new ResizeObserver(([e]) => (frame = { w: e!.contentRect.width, h: e!.contentRect.height }));
		if (frameBox) ro.observe(frameBox);
		return () => {
			el.removeEventListener('timeupdate', upd);
			el.removeEventListener('seeked', upd);
			ro.disconnect();
		};
	});
	onDestroy(() => controller?.stop());

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
			bind:this={player}
			source={base.source}
			refreshSource={base.refreshSource}
			poster={base.poster}
			fps={base.fps}
			durationMs={base.durationMs}
			label="{base.label}, with {over.label} laid over it"
			onTime={(ms) => {
				baseMs = ms;
				controller?.tick();
			}}
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

	<div class="flex flex-wrap items-center gap-3">
		<button
			type="button"
			class="btn min-h-12 {sync ? 'preset-filled-primary-500' : 'preset-outlined-surface-300-700'}"
			aria-pressed={sync}
			onclick={() => (sync = !sync)}
			data-sync-toggle
		>
			{#if sync}<Link class="size-5" strokeWidth={1.8} aria-hidden="true" />{:else}<Unlink class="size-5" strokeWidth={1.8} aria-hidden="true" />{/if}
			Sync {sync ? 'on' : 'off'}
		</button>
		<p class="text-sm text-surface-600-400">Playing and scrubbing the main video moves the overlay with it from the sync points.</p>
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

	<div class="grid grid-cols-1 gap-3 lg:grid-cols-2">
		<SyncPointControls label="Main video" syncMs={settings.baseSyncMs} currentMs={baseMs} onSet={(ms) => (settings = { ...settings, baseSyncMs: ms })} onGo={(ms) => player?.seekMs(ms)} />
		<SyncPointControls
			label="Overlay video"
			syncMs={settings.overlaySyncMs}
			currentMs={overlayMs}
			onSet={(ms) => (settings = { ...settings, overlaySyncMs: ms })}
			onGo={(ms) => overlayEl && (overlayEl.currentTime = ms / 1000)}
		/>
	</div>
</div>
