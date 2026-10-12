<script lang="ts">
	/** Checkmark in currentColor; the parent sets color and flex placement. */
	let { size = 18 }: { size?: number } = $props();
</script>

<svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex-shrink:0"><path d="M20 6L9 17l-5-5" /></svg>
