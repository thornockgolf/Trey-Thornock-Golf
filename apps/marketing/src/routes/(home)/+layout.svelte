<script lang="ts">
	import '#lib/styles/home.css';
	import SiteNav from '#lib/components/SiteNav.svelte';
	import SiteFooter from '#lib/components/SiteFooter.svelte';

	let { children } = $props();
</script>

<div class="site-home">
	<SiteNav />
	<main id="main">{@render children()}</main>
	<SiteFooter />
</div>
