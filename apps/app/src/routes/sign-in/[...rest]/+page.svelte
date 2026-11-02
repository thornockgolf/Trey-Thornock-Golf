<script lang="ts">
	import { SignIn } from 'svelte-clerk';
	import { clerkCardAppearance } from '#lib/clerk-appearance';
	import AuthLayout from '#lib/components/AuthLayout.svelte';
</script>

<svelte:head><title>Sign in | Trey Thornock Golf</title></svelte:head>

<AuthLayout heading="Sign in" intro="Welcome back. Sign in to see your lessons, videos and plan.">
	<SignIn appearance={clerkCardAppearance} />
</AuthLayout>
