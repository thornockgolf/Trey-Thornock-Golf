<script lang="ts">
	import { SignUp } from 'svelte-clerk';
	import { clerkCardAppearance } from '#lib/clerk-appearance';
	import AuthLayout from '#lib/components/AuthLayout.svelte';
</script>

<svelte:head><title>Create your account | Trey Thornock Golf</title></svelte:head>

<AuthLayout heading="Create your account" intro="Sign up to book lessons and get coaching from Trey.">
	<SignUp appearance={clerkCardAppearance} />
</AuthLayout>
