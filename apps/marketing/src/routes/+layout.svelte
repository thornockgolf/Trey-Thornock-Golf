<script lang="ts">
	import './layout.css';
	import { siteConfig } from '@ttg/shared';

	let { children } = $props();
</script>

<svelte:head>
	<title>{siteConfig.name}</title>
</svelte:head>

<a href="#main" class="sr-only focus:not-sr-only">Skip to content</a>
<main id="main">{@render children()}</main>
