<script lang="ts">
	import Star from '@lucide/svelte/icons/star';

	/** A star toggle. 44px square so it is easy to hit on a phone; a real button, so Enter and Space work. */
	let { pressed, label, onToggle }: { pressed: boolean; /** What it favorites, e.g. the drill name. The name stays the same; `aria-pressed` carries the state. */ label: string; onToggle: () => void } = $props();
</script>

<button
	type="button"
	class="btn-icon size-11 shrink-0 rounded-full hover:preset-tonal-surface {pressed ? 'text-warning-700-300' : 'text-surface-600-400'}"
	aria-pressed={pressed}
	aria-label="Favorite {label}"
	onclick={onToggle}
	data-favorite-button
>
	<Star class="size-5" fill={pressed ? 'currentColor' : 'none'} strokeWidth={1.8} aria-hidden="true" />
</button>
