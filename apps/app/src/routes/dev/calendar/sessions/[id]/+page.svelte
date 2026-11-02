<script lang="ts">
	import AppShell from '#lib/components/AppShell.svelte';
	import SessionDetail from '#lib/plans/SessionDetail.svelte';

	let { data } = $props();
</script>

<svelte:head><title>Session preview</title></svelte:head>

<AppShell role="player" pathname="/plans">
	<SessionDetail session={data.session} calendarHref="/dev/calendar" plansHref="/dev/player-plans" />
</AppShell>
