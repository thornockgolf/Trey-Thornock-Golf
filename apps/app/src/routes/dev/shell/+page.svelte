<script lang="ts">
	import AppShell from '#lib/components/AppShell.svelte';

	let { data } = $props();
</script>

<AppShell role={data.role} pathname={data.path}>
	<p class="eyebrow">{data.role}</p>
	<h1 class="h1">Shell preview</h1>
	<p class="mt-4">Dev only. Use ?role=coach&amp;path=/coach to try other states.</p>
</AppShell>
