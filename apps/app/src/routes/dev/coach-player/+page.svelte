<script lang="ts">
	import AppShell from '#lib/components/AppShell.svelte';
	import PlayerPage from '#lib/coach/PlayerPage.svelte';

	let { data } = $props();
</script>

<svelte:head><title>Player page preview</title></svelte:head>

<AppShell role="coach" pathname="/coach">
	<PlayerPage player={data.player} questionnaire={data.questionnaire} videos={data.videos} sessions={data.sessions} notes={[]} calendar={data.calendar} assessments={data.assessments} profile={data.profile} apiBase="/dev/mock-api" backHref="/dev/coach" />
</AppShell>
