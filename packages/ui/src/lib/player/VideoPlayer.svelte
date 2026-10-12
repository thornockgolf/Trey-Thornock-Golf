<script lang="ts" module>
	/** Where to load the video from. URLs are short-lived signed R2 URLs. */
	export interface PlaybackSource {
		url: string;
		/** ISO time the URL stops working; used to renew it before playing. */
		expiresAt?: string | null;
		/** Scrub-preview sprite and its VTT (both signed). */
		spriteUrl?: string | null;
		spriteVttUrl?: string | null;
	}
</script>

<script lang="ts">
	import 'video.js/dist/video-js.css';
	import videojs from 'video.js';
	import type Player from 'video.js/dist/types/player';
	import Maximize from '@lucide/svelte/icons/maximize';
	import Pause from '@lucide/svelte/icons/pause';
	import Play from '@lucide/svelte/icons/play';
	import Repeat from '@lucide/svelte/icons/repeat';
	import SkipBack from '@lucide/svelte/icons/step-back';
	import SkipForward from '@lucide/svelte/icons/step-forward';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import { onMount, untrack, type Snippet } from 'svelte';
	import {
		PLAYBACK_RATES,
		canRefresh,
		clamp,
		cueAt,
		formatClock,
		formatRate,
		frameAt,
		isExpired,
		isRefreshableMediaError,
		parseSpriteVtt,
		stepTime,
		type SpriteCue
	} from './player-logic';

	interface Props {
		source: PlaybackSource;
		/** Fetch a new signed source; called when the URL expired or playback failed. */
		refreshSource?: () => Promise<PlaybackSource>;
		poster?: string | null;
		/** Frames per second of the processed video (from the probe). Frame stepping needs it. */
		fps: number;
		durationMs?: number | null;
		/** Short description for assistive technology. */
		label?: string;
		/** Restart from 0 when the video ends (spec: default on). */
		autoReplay?: boolean;
		/** Called with the playhead in integer milliseconds on every displayed frame (annotations hook in here). */
		onTime?: (ms: number) => void;
		/** Drawn over the picture, above the tap-to-play layer and below the controls (annotations). */
		overlay?: Snippet;
		/** Moments to mark on the scrub bar, in ms (annotation start times). */
		markers?: readonly number[];
		/** Hide the auto-replay toggle (Compare turns replay off while synced so the shorter video holds its last frame). */
		replayLocked?: boolean;
	}
	let { source, refreshSource, poster = null, fps, durationMs = null, label = 'Swing video', autoReplay = $bindable(true), onTime, overlay, markers = [], replayLocked = false }: Props = $props();

	const uid = $props.id();
	let root: HTMLDivElement;
	let videoEl: HTMLVideoElement;
	let player: Player | undefined;

	let current = $state(0); // seconds
	let duration = $state(untrack(() => (durationMs ?? 0) / 1000));
	let playing = $state(false);
	let started = $state(false);
	let rate = $state(1);
	let bufferedPct = $state(0);
	let scrubbing = $state(false);
	let failed = $state(false);
	let busy = $state(false); // refreshing the URL
	let announce = $state('');
	let fullscreen = $state(false);

	let live = $state<PlaybackSource>(untrack(() => source));
	const refreshes: number[] = [];
	let wantPlay = false; // intent to play, kept across a URL refresh
	let raf = 0;

	let cues = $state<SpriteCue[]>([]);
	let hoverMs = $state<number | null>(null);
	let hoverX = $state(0);
	let trackEl = $state<HTMLDivElement>();

	const frameStep = $derived(fps > 0 ? 1 / fps : 1 / 30);
	const frame = $derived(frameAt(current, fps));
	const pct = $derived(duration > 0 ? (current / duration) * 100 : 0);
	const preview = $derived(hoverMs !== null && live.spriteUrl ? cueAt(cues, hoverMs) : undefined);

	const emit = () => {
		onTime?.(Math.round(current * 1000));
	};
	const readTime = () => {
		if (!player) return;
		const t = player.currentTime() ?? 0;
		if (!scrubbing) current = t;
		const d = player.duration();
		if (d && Number.isFinite(d)) duration = d;
		bufferedPct = Math.round((player.bufferedPercent() ?? 0) * 100);
		emit();
	};
	const loop = () => {
		readTime();
		raf = requestAnimationFrame(loop);
	};
	const startLoop = () => {
		cancelAnimationFrame(raf);
		raf = requestAnimationFrame(loop);
	};
	const stopLoop = () => {
		cancelAnimationFrame(raf);
		raf = 0;
	};

	const loadSprite = async (src: PlaybackSource) => {
		cues = [];
		if (!src.spriteVttUrl || !src.spriteUrl) return;
		try {
			const res = await fetch(src.spriteVttUrl);
			if (res.ok) cues = parseSpriteVtt(await res.text());
		} catch {
			// the preview is optional
		}
	};

	const setSource = (src: PlaybackSource, resumeAt = 0, play = false) => {
		live = src;
		void loadSprite(src);
		player?.one('loadedmetadata', () => {
			if (resumeAt > 0) player?.currentTime(resumeAt);
			readTime();
			if (play) void player?.play()?.catch(() => {});
		});
		player?.src({ src: src.url, type: 'video/mp4' });
	};

	/** Fetch a new URL and continue from the same time. Returns false if it cannot (limit hit or request failed). */
	const refresh = async (resumeAt: number, play: boolean) => {
		if (!refreshSource || busy) return false;
		if (!canRefresh(refreshes, Date.now())) return false;
		refreshes.push(Date.now());
		busy = true;
		try {
			setSource(await refreshSource(), resumeAt, play);
			failed = false;
			return true;
		} catch {
			return false;
		} finally {
			busy = false;
		}
	};

	const togglePlay = async () => {
		if (!player) return;
		if (player.paused()) {
			wantPlay = true;
			// an expired URL would fail the request; renew it first and carry on from the same spot
			if (isExpired(live.expiresAt, Date.now())) {
				if (await refresh(player.currentTime() ?? 0, true)) return;
			}
			void player.play()?.catch(() => {});
		} else {
			wantPlay = false;
			player.pause();
		}
	};

	const seek = (seconds: number) => {
		if (!player) return;
		const t = clamp(seconds, 0, duration || seconds);
		player.currentTime(t);
		current = t;
		emit();
	};

	/** Step by whole frames (negative = back); pauses first so the frame shown is the frame stepped to. */
	export function stepFrames(frames: number) {
		if (!player) return;
		wantPlay = false;
		if (!player.paused()) player.pause();
		const t = stepTime(player.currentTime() ?? 0, fps, frames, duration || Number.MAX_SAFE_INTEGER);
		seek(t);
		announce = `Frame ${frameAt(t, fps)}, ${formatClock(t)}`;
	}
	export function seekMs(ms: number) {
		seek(ms / 1000);
	}
	export function getPlayer() {
		return player;
	}

	const onKey = (e: KeyboardEvent) => {
		const target = e.target as HTMLElement;
		if (target.closest('input, select, textarea') || e.ctrlKey || e.metaKey || e.altKey) return;
		const onButton = !!target.closest('button');
		switch (e.key) {
			case 'ArrowLeft':
			case 'ArrowRight': {
				e.preventDefault();
				const dir = e.key === 'ArrowRight' ? 1 : -1;
				if (e.shiftKey) seek((player?.currentTime() ?? 0) + dir);
				else stepFrames(dir);
				break;
			}
			case ',':
			case '.':
				e.preventDefault();
				stepFrames(e.key === '.' ? 1 : -1);
				break;
			case ' ':
			case 'k':
				if (e.key === ' ' && onButton) return; // let a focused button handle Space itself
				e.preventDefault();
				void togglePlay();
				break;
		}
	};

	const onScrub = (e: Event) => {
		const v = Number((e.currentTarget as HTMLInputElement).value);
		current = v;
		hoverMs = v * 1000;
		hoverX = duration > 0 && trackEl ? (v / duration) * trackEl.clientWidth : 0;
		seek(v);
	};
	const onTrackMove = (e: PointerEvent) => {
		if (duration <= 0 || !trackEl) return;
		const r = trackEl.getBoundingClientRect();
		const x = clamp(e.clientX - r.left, 0, r.width);
		hoverX = x;
		hoverMs = (x / r.width) * duration * 1000;
	};

	const toggleFullscreen = async () => {
		if (document.fullscreenElement) return void (await document.exitFullscreen());
		if (root.requestFullscreen) return void (await root.requestFullscreen().catch(() => {}));
		// iPhone Safari only fullscreens the video element itself (with its native controls)
		(videoEl as HTMLVideoElement & { webkitEnterFullscreen?: () => void }).webkitEnterFullscreen?.();
	};

	onMount(() => {
		player = videojs(videoEl, {
			controls: false,
			preload: 'metadata',
			playsinline: true,
			poster: poster ?? undefined,
			fluid: false,
			fill: true,
			disablePictureInPicture: false,
			sources: [{ src: live.url, type: 'video/mp4' }]
		});
		void loadSprite(live);

		player.on('loadedmetadata', readTime);
		player.on('durationchange', readTime);
		player.on('progress', readTime);
		player.on('seeked', readTime);
		player.on('play', () => {
			playing = true;
			started = true;
			startLoop();
		});
		player.on('pause', () => {
			playing = false;
			stopLoop();
			readTime();
		});
		player.on('ratechange', () => {
			rate = player?.playbackRate() ?? 1;
		});
		player.on('ended', () => {
			playing = false;
			stopLoop();
			readTime();
			if (autoReplay && !replayLocked) {
				player?.currentTime(0);
				void player?.play()?.catch(() => {});
			}
		});
		player.on('error', () => {
			const code = player?.error()?.code;
			const at = player?.currentTime() ?? current;
			const resume = wantPlay;
			if (isRefreshableMediaError(code)) {
				void refresh(at, resume).then((ok) => {
					if (!ok) failed = true;
				});
			} else {
				failed = true;
			}
		});
		const onFs = () => (fullscreen = document.fullscreenElement === root);
		document.addEventListener('fullscreenchange', onFs);

		return () => {
			document.removeEventListener('fullscreenchange', onFs);
			stopLoop();
			player?.dispose();
			player = undefined;
		};
	});

	$effect(() => {
		const r = rate;
		untrack(() => {
			if (player && player.playbackRate() !== r) player.playbackRate(r);
		});
	});
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
<div
	bind:this={root}
	class="player on-dark relative isolate overflow-hidden rounded-container bg-primary-950 text-white select-none"
	class:player-fs={fullscreen}
	role="group"
	aria-label={label}
	aria-roledescription="video player"
	tabindex="0"
	onkeydown={onKey}
>
	<div class="relative aspect-video w-full bg-black" class:fs-fill={fullscreen}>
		<!-- svelte-ignore a11y_media_has_caption -->
		<video bind:this={videoEl} class="video-js vjs-fill" playsinline aria-hidden="true"></video>

		<!-- tap the picture to play/pause -->
		<button type="button" class="absolute inset-0 size-full cursor-pointer" tabindex="-1" aria-label={playing ? 'Pause' : 'Play'} onclick={togglePlay}></button>

		{@render overlay?.()}

		{#if !playing && !failed && !busy}
			<button
				type="button"
				class="absolute top-1/2 left-1/2 flex size-[72px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-tertiary-500 text-secondary-950 shadow-lg transition-transform hover:scale-105 focus-visible:scale-105"
				aria-label={started ? 'Play' : 'Play video'}
				onclick={togglePlay}
			>
				<Play class="size-8 translate-x-0.5" fill="currentColor" strokeWidth={0} aria-hidden="true" />
			</button>
		{/if}

		{#if busy}
			<div class="absolute inset-0 flex items-center justify-center bg-black/40 text-sm" role="status">Reconnecting…</div>
		{/if}

		{#if failed}
			<div class="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/70 p-6 text-center" role="alert">
				<TriangleAlert class="size-8 text-tertiary-400" strokeWidth={1.8} aria-hidden="true" />
				<p class="max-w-[28ch]">This video couldn't be played.</p>
				<button type="button" class="btn min-h-11 preset-filled-tertiary-500" onclick={() => { failed = false; refreshes.length = 0; void refresh(current, false); }}>
					Try again
				</button>
			</div>
		{/if}
	</div>

	<div class="controls flex flex-col gap-1 bg-primary-950/90 px-3 pt-2 pb-2">
		<!-- scrub bar with sprite preview -->
		<div
			bind:this={trackEl}
			class="relative h-11 touch-none"
			role="presentation"
			onpointermove={onTrackMove}
			onpointerleave={() => !scrubbing && (hoverMs = null)}
			onpointerdown={() => (scrubbing = true)}
			onpointerup={() => {
				scrubbing = false;
				hoverMs = null;
			}}
			onpointercancel={() => {
				scrubbing = false;
				hoverMs = null;
			}}
		>
			{#if hoverMs !== null && duration > 0}
				<div
					class="pointer-events-none absolute bottom-full z-10 mb-1 flex -translate-x-1/2 flex-col items-center gap-1"
					style:left="{clamp(hoverX, preview ? preview.w / 2 : 28, Math.max(preview ? preview.w / 2 : 28, (trackEl?.clientWidth ?? 0) - (preview ? preview.w / 2 : 28)))}px"
				>
					{#if preview && live.spriteUrl}
						<div
							class="rounded-base border border-white/40 bg-black"
							style:width="{preview.w}px"
							style:height="{preview.h}px"
							style:background-image="url({live.spriteUrl})"
							style:background-position="-{preview.x}px -{preview.y}px"
							style:background-repeat="no-repeat"
							aria-hidden="true"
						></div>
					{/if}
					<span class="rounded-base bg-black/80 px-1.5 py-0.5 font-display text-xs tabular-nums">{formatClock(hoverMs / 1000)}</span>
				</div>
			{/if}
			{#if duration > 0}
				{#each markers as m (m)}
					<span
						class="pointer-events-none absolute top-[5px] z-[1] size-2 -translate-x-1/2 rounded-full bg-tertiary-500 ring-1 ring-black/60"
						style:left="{clamp((m / 1000 / duration) * 100, 0, 100)}%"
						aria-hidden="true"
					></span>
				{/each}
			{/if}
			<input
				type="range"
				class="scrub absolute inset-0 size-full"
				min="0"
				max={duration || 0}
				step={frameStep}
				value={current}
				style="--played:{pct}%;--buffered:{bufferedPct}%"
				aria-label="Seek"
				aria-valuetext="{formatClock(current)} of {formatClock(duration)}"
				disabled={duration <= 0}
				oninput={onScrub}
			/>
		</div>

		<div class="flex flex-wrap items-center gap-x-1 gap-y-1">
			<button type="button" class="pbtn" aria-label={playing ? 'Pause' : 'Play'} onclick={togglePlay}>
				{#if playing}<Pause class="size-5" fill="currentColor" strokeWidth={0} aria-hidden="true" />{:else}<Play class="size-5" fill="currentColor" strokeWidth={0} aria-hidden="true" />{/if}
			</button>
			<button type="button" class="pbtn" aria-label="Back one frame" title="Back one frame (←)" onclick={() => stepFrames(-1)}>
				<SkipBack class="size-5" strokeWidth={1.8} aria-hidden="true" />
			</button>
			<button type="button" class="pbtn" aria-label="Forward one frame" title="Forward one frame (→)" onclick={() => stepFrames(1)}>
				<SkipForward class="size-5" strokeWidth={1.8} aria-hidden="true" />
			</button>

			<p class="ml-1 font-display text-[13px] tabular-nums" aria-hidden="true">
				{formatClock(current)} <span class="text-white/60">/ {formatClock(duration)}</span>
				<span class="ml-2 text-white/60">F{frame}</span>
			</p>

			<span class="grow"></span>

			<label class="sr-only" for="rate-{uid}">Playback speed</label>
			<select
				id="rate-{uid}"
				class="min-h-11 rounded-base border border-white/30 bg-primary-950 px-2 text-[13px] text-white"
				value={rate}
				onchange={(e) => (rate = Number((e.currentTarget as HTMLSelectElement).value))}
			>
				{#each PLAYBACK_RATES as r (r)}
					<option value={r}>{formatRate(r)}</option>
				{/each}
			</select>

			{#if !replayLocked}
				<button
					type="button"
					class="pbtn"
					class:pbtn-on={autoReplay}
					aria-pressed={autoReplay}
					aria-label="Auto-replay"
					title="Auto-replay at the end"
					onclick={() => (autoReplay = !autoReplay)}
				>
					<Repeat class="size-5" strokeWidth={1.8} aria-hidden="true" />
				</button>
			{/if}
			<button type="button" class="pbtn" aria-label={fullscreen ? 'Exit full screen' : 'Full screen'} onclick={toggleFullscreen}>
				<Maximize class="size-5" strokeWidth={1.8} aria-hidden="true" />
			</button>
		</div>
	</div>

	<p class="sr-only" aria-live="polite">{announce}</p>
</div>

<style>
	/* Player chrome stays dark in both color modes (style guide). Only tokens, no raw hex. */
	.player:focus-visible {
		outline: 2px solid var(--color-tertiary-400);
		outline-offset: 2px;
	}
	.player :global(.video-js) {
		background: black;
	}
	.player :global(.vjs-poster) {
		background-size: cover;
	}
	.player.player-fs {
		border-radius: 0;
		display: flex;
		flex-direction: column;
		justify-content: center;
		height: 100%;
	}
	.fs-fill {
		aspect-ratio: auto;
		flex: 1;
	}
	.pbtn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 44px;
		min-height: 44px;
		border-radius: var(--radius-base);
		color: white;
	}
	.pbtn:hover {
		background: color-mix(in oklab, white 14%, transparent);
	}
	.pbtn-on {
		color: var(--color-tertiary-400);
	}
	/* Scrub bar: played = gold, buffered = white/30, rest = white/15 */
	.scrub {
		appearance: none;
		background: transparent;
		cursor: pointer;
		margin: 0;
	}
	.scrub::-webkit-slider-runnable-track {
		height: 6px;
		border-radius: 3px;
		background: linear-gradient(
			to right,
			var(--color-tertiary-500) var(--played),
			color-mix(in oklab, white 30%, transparent) var(--played) var(--buffered),
			color-mix(in oklab, white 15%, transparent) var(--buffered)
		);
	}
	.scrub::-moz-range-track {
		height: 6px;
		border-radius: 3px;
		background: linear-gradient(
			to right,
			var(--color-tertiary-500) var(--played),
			color-mix(in oklab, white 30%, transparent) var(--played) var(--buffered),
			color-mix(in oklab, white 15%, transparent) var(--buffered)
		);
	}
	.scrub::-webkit-slider-thumb {
		appearance: none;
		width: 18px;
		height: 18px;
		margin-top: -6px;
		border-radius: 50%;
		background: var(--color-tertiary-500);
		border: 2px solid white;
	}
	.scrub::-moz-range-thumb {
		width: 14px;
		height: 14px;
		border-radius: 50%;
		background: var(--color-tertiary-500);
		border: 2px solid white;
	}
	.scrub:focus-visible {
		outline: 2px solid var(--color-tertiary-400);
		outline-offset: 2px;
		border-radius: 4px;
	}
</style>
