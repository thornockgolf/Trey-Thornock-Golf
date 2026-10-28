<script lang="ts">
	import AppShell from '#lib/components/AppShell.svelte';
	import FeedbackPage from '#lib/feedback/FeedbackPage.svelte';

	let { data } = $props();
</script>

<svelte:head><title>Feedback preview</title></svelte:head>

<AppShell role={data.role} pathname="/feedback" feedback>
	<FeedbackPage role={data.role} userId={data.userId} apiBase="/dev/mock-api/as-{data.role}" />
</AppShell>
