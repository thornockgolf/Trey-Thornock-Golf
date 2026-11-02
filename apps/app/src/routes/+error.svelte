<script lang="ts">
	import { useClerkContext } from 'svelte-clerk';
	import { page } from '$app/state';
	import AuthLayout from '#lib/components/AuthLayout.svelte';
	import { errorCopy } from '#lib/error-copy';

	const clerk = useClerkContext();
	const copy = $derived(errorCopy(page.status, page.error?.message));
</script>

<svelte:head><title>{copy.heading} | Trey Thornock Golf</title></svelte:head>

<AuthLayout heading={copy.heading} intro={copy.body}>
	<div class="flex w-full flex-col gap-3 sm:flex-row sm:justify-center">
		<a href="/" class="btn preset-filled-primary-500 min-h-12">Back to home</a>
		{#if copy.signOut}<button type="button" class="btn preset-outlined-secondary-500 min-h-12" onclick={() => clerk.clerk?.signOut({ redirectUrl: '/sign-in' })}>Sign out</button>{/if}
	</div>
</AuthLayout>
