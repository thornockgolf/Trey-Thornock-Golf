<script lang="ts">
	// The first source that loads, else initials. Signed photo URLs expire, so a failed image moves on to the next source.
	let { sources, initials }: { sources: (string | null | undefined)[]; initials: string } = $props();
	const list = $derived(sources.filter((s): s is string => !!s));
	let failed = $state<string[]>([]);
	const src = $derived(list.find((s) => !failed.includes(s)));
</script>

{#if src}<img {src} alt="" class="size-full object-cover" referrerpolicy="no-referrer" onerror={() => (failed = [...failed, src])} />{:else}{initials}{/if}
