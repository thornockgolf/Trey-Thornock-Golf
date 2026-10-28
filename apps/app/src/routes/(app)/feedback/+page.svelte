<script lang="ts">
	import FeedbackPage from '#lib/feedback/FeedbackPage.svelte';

	let { data } = $props();
</script>

<svelte:head><title>Feedback | Trey Thornock Golf</title></svelte:head>

<FeedbackPage role={data.user.role} userId={data.user.id} />
