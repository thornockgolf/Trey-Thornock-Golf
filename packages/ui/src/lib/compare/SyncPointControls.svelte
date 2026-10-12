<script lang="ts">
	import Crosshair from '@lucide/svelte/icons/crosshair';
	import { formatClock } from '../player/player-logic';

	interface Props {
		/** What this is a sync point for, e.g. "Left video". */
		label: string;
		syncMs: number;
		/** The video's playhead now, in ms. */
		currentMs: number;
		onSet: (ms: number) => void;
		onGo: (ms: number) => void;
	}
	let { label, syncMs, currentMs, onSet, onGo }: Props = $props();
</script>

<div class="flex flex-wrap items-center gap-2 text-sm" role="group" aria-label="{label} sync point">
	<span class="text-surface-600-400">{label} sync point</span>
	<button type="button" class="btn min-h-11 preset-outlined-surface-300-700 tabular-nums" onclick={() => onGo(syncMs)} aria-label="Go to the {label} sync point, {formatClock(syncMs / 1000)}">
		{formatClock(syncMs / 1000)}
	</button>
	<button type="button" class="btn min-h-11 preset-outlined-surface-300-700" onclick={() => onSet(currentMs)}>
		<Crosshair class="size-4" strokeWidth={1.8} aria-hidden="true" /> Set to now
	</button>
	{#if syncMs !== 0}
		<button type="button" class="btn min-h-11 preset-outlined-surface-300-700" onclick={() => onSet(0)}>Clear</button>
	{/if}
</div>
