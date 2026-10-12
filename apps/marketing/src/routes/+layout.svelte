<script lang="ts">
	import './layout.css';

	let { children } = $props();
</script>

<a href="#main" class="skip">Skip to content</a>
{@render children()}

<style>
	.skip { position: absolute; left: -9999px; top: 0; z-index: 2000; background: var(--navy); color: var(--white); padding: 10px 16px; border-radius: 0 0 8px 0; }
	.skip:focus { left: 0; }
</style>
