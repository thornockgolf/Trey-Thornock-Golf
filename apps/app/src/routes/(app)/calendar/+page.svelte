<script lang="ts">
	import CalendarPage from '#lib/calendar/CalendarPage.svelte';

	let { data } = $props();
</script>

<svelte:head><title>Calendar | Trey Thornock Golf</title></svelte:head>

<CalendarPage data={data.calendar} videos={data.videos} />
