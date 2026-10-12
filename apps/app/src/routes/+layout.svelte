<script lang="ts">
	import './layout.css';
	import { ClerkProvider } from 'svelte-clerk';

	let { children } = $props();
</script>

<ClerkProvider signInUrl="/sign-in" signUpUrl="/sign-up">
	{@render children()}
</ClerkProvider>
