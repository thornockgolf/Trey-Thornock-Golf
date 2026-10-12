<script lang="ts">
	import { UserButton } from 'svelte-clerk';
</script>

<svelte:head><title>Coach | Trey Thornock Golf</title></svelte:head>

<main class="mx-auto max-w-app px-6 py-16">
	<div class="flex items-center justify-between">
		<p class="eyebrow">Coach</p>
		<UserButton />
	</div>
	<h1 class="h1">Coach area</h1>
	<p class="mt-4">Players, analyses and notes arrive here. Only coaches can see this page.</p>
</main>
