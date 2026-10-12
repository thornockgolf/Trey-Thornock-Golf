<script lang="ts">
	import { UserButton } from 'svelte-clerk';
</script>

<svelte:head><title>Trey Thornock Golf App</title></svelte:head>

<main class="mx-auto max-w-app px-6 py-16">
	<div class="flex items-center justify-between">
		<p class="eyebrow">Coaching app</p>
		<UserButton />
	</div>
	<h1 class="h1">Trey Thornock Golf</h1>
	<p class="mt-4">Signed in. The player and coach areas arrive next.</p>
</main>
