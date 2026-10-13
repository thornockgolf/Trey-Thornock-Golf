<script lang="ts">
	import type { Snippet } from 'svelte';
	import Seo from '#lib/components/Seo.svelte';

	let {
		title,
		heading,
		description,
		path,
		updated,
		children
	}: { title: string; heading: string; description: string; path: string; updated: string; children: Snippet } = $props();
</script>

<Seo {title} {description} {path} jsonLdDescription={description} />

<section class="hero">
	<div class="wrap">
		<div class="eyebrow">Legal</div>
		<h1>{heading}</h1>
		<p class="updated">Last updated {updated}</p>
	</div>
</section>

<section class="legal">
	<div class="wrap">{@render children()}</div>
</section>

<style>
	.updated { color: var(--text-muted); font-size: 14px; margin: 0; }
	.legal :global(h2) { margin-top: 36px; }
	.legal :global(h2:first-child) { margin-top: 0; }
	.legal :global(p),
	.legal :global(li) { line-height: 1.7; }
	.legal :global(ul) { padding-left: 22px; margin: 0 0 16px; }
	.legal :global(li) { margin-bottom: 6px; }
	.legal :global(a) { text-decoration: underline; }
</style>
