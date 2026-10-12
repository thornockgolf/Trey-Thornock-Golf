<script lang="ts">
	let { tags, center = false }: { tags: string[]; center?: boolean } = $props();
</script>

<div class="tag-pills" class:center>
	{#each tags as tag}<span>{tag}</span>{/each}
</div>

<style>
	.tag-pills { display: flex; flex-wrap: wrap; gap: 9px; margin-top: 24px; }
	.center { justify-content: center; }
	span {
		font-family: var(--font-display); font-size: 12px; font-weight: 600; color: var(--link);
		background: var(--tint-green); border: 1px solid var(--tint-green-line); padding: 7px 13px; border-radius: 100px;
	}
</style>
