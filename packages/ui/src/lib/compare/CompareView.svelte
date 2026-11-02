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
	import VideoPlayer from '../player/VideoPlayer.svelte';

	interface Props {
		left: CompareVideo;
		right: CompareVideo;
	}
	let { left, right }: Props = $props();
</script>

<div class="grid grid-cols-1 gap-3 lg:grid-cols-2 lg:gap-4" data-compare>
	{#each [{ v: left, side: 'Left', attr: 'data-compare-left' }, { v: right, side: 'Right', attr: 'data-compare-right' }] as c (c.side)}
		<section class="flex min-w-0 flex-col gap-2" aria-label="{c.side} video: {c.v.label}" {...{ [c.attr]: '' }}>
			<h3 class="truncate font-display font-semibold text-secondary-500 dark:text-secondary-100">{c.v.label}</h3>
			<VideoPlayer
				source={c.v.source}
				refreshSource={c.v.refreshSource}
				poster={c.v.poster}
				fps={c.v.fps}
				durationMs={c.v.durationMs}
				label={c.v.label}
				adaptive
				maxHeight="70dvh"
			/>
		</section>
	{/each}
</div>
