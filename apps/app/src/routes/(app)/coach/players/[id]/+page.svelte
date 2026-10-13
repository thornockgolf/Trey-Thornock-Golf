<script lang="ts">
	import PlayerPage from '#lib/coach/PlayerPage.svelte';

	let { data } = $props();
</script>

<svelte:head><title>Player | Trey Thornock Golf</title></svelte:head>

<PlayerPage player={data.player} questionnaire={data.questionnaire} videos={data.videos} sessions={data.sessions} notes={data.notes} calendar={data.calendar} assessments={data.assessments} profile={data.profile} />
