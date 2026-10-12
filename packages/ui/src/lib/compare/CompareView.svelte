<script lang="ts" module>
	import type { PlaybackSource } from '../player/VideoPlayer.svelte';

	/** Everything a player needs about one video. */
	export interface CompareVideo {
		id: string;
		label: string;
		source: PlaybackSource;
		refreshSource?: () => Promise<PlaybackSource>;
		poster: string | null;
		fps: number;
		durationMs: number | null;
	}
</script>

<script lang="ts">
	import { onDestroy, untrack } from 'svelte';
	import Link from '@lucide/svelte/icons/link';
	import Unlink from '@lucide/svelte/icons/unlink';
	import VideoPlayer from '../player/VideoPlayer.svelte';
	import SyncPointControls from './SyncPointControls.svelte';
	import { SyncController } from './sync';
	import { playerTarget } from './targets';

	interface Props {
		left: CompareVideo;
		right: CompareVideo;
		/** Keep the two aligned from their sync points. */
		sync?: boolean;
		/** The moment in each video that counts as the same instant (address, impact), in ms. */
		points?: { a: number; b: number };
	}
	let { left, right, sync = $bindable(false), points = $bindable({ a: 0, b: 0 }) }: Props = $props();

	let a = $state<ReturnType<typeof VideoPlayer>>();
	let b = $state<ReturnType<typeof VideoPlayer>>();
	let aMs = $state(0);
	let bMs = $state(0);
	let replayA = $state(true);
	let replayB = $state(true);

	const frameMs = () => 1000 / Math.min(left.fps || 30, right.fps || 30);

	let controller: SyncController | undefined;

	// While synced the shorter video must hold its last frame, so replay is off for both
	$effect(() => {
		if (sync) {
			replayA = false;
			replayB = false;
		}
	});

	$effect(() => {
		const pa = a?.getPlayer();
		const pb = b?.getPlayer();
		if (!sync || !pa || !pb) return;
		controller = new SyncController(playerTarget(pa), playerTarget(pb), { points: () => points, frameMs });
		controller.start();
		return () => {
			controller?.stop();
			controller = undefined;
		};
	});

	// new sync points re-aim the right video straight away
	$effect(() => {
		void points.a;
		void points.b;
		untrack(() => controller?.align());
	});

	onDestroy(() => controller?.stop());

	const onTimeA = (ms: number) => {
		aMs = ms;
		controller?.tick();
	};
</script>

<div class="flex flex-col gap-4" data-compare>
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
		<p class="text-sm text-surface-600-400" role="status">
			{sync
				? 'Playing, pausing, scrubbing and speed move both videos together from the sync points. A shorter video holds its last frame.'
				: 'Each video has its own controls. Turn Sync on to link them.'}
		</p>
	</div>

	<div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
		<section class="flex min-w-0 flex-col gap-2" aria-label="Left video: {left.label}" data-compare-left>
			<h3 class="truncate font-display font-semibold text-secondary-500 dark:text-secondary-100">{left.label}</h3>
			<VideoPlayer
				bind:this={a}
				source={left.source}
				refreshSource={left.refreshSource}
				poster={left.poster}
				fps={left.fps}
				durationMs={left.durationMs}
				label={left.label}
				bind:autoReplay={replayA}
				replayLocked={sync}
				onTime={onTimeA}
			/>
			<SyncPointControls label="Left video" syncMs={points.a} currentMs={aMs} onSet={(ms) => (points = { ...points, a: ms })} onGo={(ms) => a?.seekMs(ms)} />
		</section>

		<section class="flex min-w-0 flex-col gap-2" aria-label="Right video: {right.label}" data-compare-right>
			<h3 class="truncate font-display font-semibold text-secondary-500 dark:text-secondary-100">{right.label}</h3>
			<VideoPlayer
				bind:this={b}
				source={right.source}
				refreshSource={right.refreshSource}
				poster={right.poster}
				fps={right.fps}
				durationMs={right.durationMs}
				label={right.label}
				bind:autoReplay={replayB}
				replayLocked={sync}
				onTime={(ms) => (bMs = ms)}
			/>
			<SyncPointControls label="Right video" syncMs={points.b} currentMs={bMs} onSet={(ms) => (points = { ...points, b: ms })} onGo={(ms) => b?.seekMs(ms)} />
		</section>
	</div>
</div>
