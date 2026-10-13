<script lang="ts">
	import AppShell from '#lib/components/AppShell.svelte';
	import CalendarPage from '#lib/calendar/CalendarPage.svelte';

	let { data } = $props();
</script>

<svelte:head><title>Calendar preview</title></svelte:head>

<AppShell role="player" pathname="/calendar">
	<CalendarPage data={data.calendar} videos={data.videos} apiBase="/dev/mock-api" />
</AppShell>
