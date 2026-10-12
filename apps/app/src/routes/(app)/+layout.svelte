<script lang="ts">
	import { page } from '$app/state';
	import AppShell from '#lib/components/AppShell.svelte';

	let { data, children } = $props();
</script>

<AppShell role={data.user.role} pathname={page.url.pathname}>
	{@render children()}
</AppShell>
