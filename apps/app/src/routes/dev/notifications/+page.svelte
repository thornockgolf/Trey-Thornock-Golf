<script lang="ts">
	import AppShell from '#lib/components/AppShell.svelte';
	import NotificationsPage from '#lib/notifications/NotificationsPage.svelte';
</script>

<svelte:head><title>Notifications preview</title></svelte:head>

<AppShell role="player" pathname="/notifications">
	<NotificationsPage />
</AppShell>
