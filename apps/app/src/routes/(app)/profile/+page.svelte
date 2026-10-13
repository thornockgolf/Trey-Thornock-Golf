<script lang="ts">
	import ProfilePage from '#lib/profile/ProfilePage.svelte';

	let { data } = $props();
</script>

<svelte:head><title>Profile | Trey Thornock Golf</title></svelte:head>

<ProfilePage profile={data} />
