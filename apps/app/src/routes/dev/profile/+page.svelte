<script lang="ts">
	import AppShell from '#lib/components/AppShell.svelte';
	import ProfilePage from '#lib/profile/ProfilePage.svelte';

	let { data } = $props();
</script>

<svelte:head><title>Profile preview</title></svelte:head>

<AppShell role="player" pathname="/profile">
	<ProfilePage profile={data.profile} apiBase="/dev/mock-api" />
</AppShell>
