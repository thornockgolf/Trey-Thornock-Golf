<script lang="ts">
	import type Player from 'video.js/dist/types/player';
	import { onDestroy } from 'svelte';
	import { CommentarySync, activeSegment, type ClipTarget, type CommentarySegment } from './commentary-sync';

	interface Props {
		/** The video.js player of the analysed video (from `VideoPlayer.getPlayer()`); the clips follow it. */
		player: Player | undefined;
		segments: readonly CommentarySegment[];
		/** A clip stopped loading (its signed URL probably expired): the owner should fetch the manifest again. */
		onExpired?: () => void;
	}
	let { player, segments, onExpired }: Props = $props();

	let els = $state<Record<string, HTMLVideoElement | undefined>>({});
	let pipUrl = $state<string | null>(null);

	const urls = $derived([...new Set(segments.map((s) => s.url))]);
	const hasVideo = (url: string) => segments.some((s) => s.url === url && s.hasVideo);

	const targetOf = (el: HTMLVideoElement): ClipTarget => ({
		currentMs: () => Math.round(el.currentTime * 1000),
		seekMs: (ms) => {
			el.currentTime = ms / 1000;
		},
		paused: () => el.paused,
		play: () => void el.play().catch(() => {}),
		pause: () => el.pause(),
		rate: () => el.playbackRate,
		setRate: (r) => {
			el.playbackRate = r;
		}
	});
	const sync = new CommentarySync([], (seg) => {
		const el = els[seg.url];
		return el ? targetOf(el) : undefined;
	});
	$effect(() => sync.setSegments(segments));

	/** Call with the video's time on every displayed frame (the page's `onTime`). */
	export function tick(ms: number, exact = false) {
		if (!player) return;
		const active = activeSegment(segments, ms);
		pipUrl = active?.hasVideo ? active.url : null;
		sync.update(ms, !player.paused() && !player.ended(), player.playbackRate() ?? 1, exact);
	}

	$effect(() => {
		const p = player;
		if (!p) return;
		const now = () => Math.round((p.currentTime() ?? 0) * 1000);
		const onPlay = () => tick(now());
		const onPause = () => tick(now());
		const onSeeked = () => tick(now(), true);
		p.on('play', onPlay);
		p.on('pause', onPause);
		p.on('ratechange', onPlay);
		p.on('seeked', onSeeked);
		return () => {
			p.off('play', onPlay);
			p.off('pause', onPause);
			p.off('ratechange', onPlay);
			p.off('seeked', onSeeked);
			sync.stop();
		};
	});
	onDestroy(() => sync.stop());
</script>

{#each urls as url (url)}
	<!-- svelte-ignore a11y_media_has_caption -->
	<video
		bind:this={els[url]}
		src={url}
		playsinline
		preload="auto"
		aria-hidden="true"
		class={hasVideo(url) && pipUrl === url
			? 'pointer-events-none absolute right-3 bottom-3 z-[2] w-1/4 min-w-24 rounded-base border-2 border-white/70 bg-black object-cover shadow-lg'
			: 'hidden'}
		data-commentary-clip
		onerror={() => onExpired?.()}
	></video>
{/each}
