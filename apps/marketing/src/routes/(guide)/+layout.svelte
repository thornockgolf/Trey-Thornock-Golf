<script lang="ts">
	import '#lib/styles/guide.css';
	import GuideHeader from '#lib/components/GuideHeader.svelte';
	import GuideFooter from '#lib/components/GuideFooter.svelte';

	let { children } = $props();
</script>

<div class="site-guide">
	<GuideHeader />
	<main id="main">{@render children()}</main>
	<GuideFooter />
</div>
