<script lang="ts">
	import './layout.css';
	import { onMount } from 'svelte';
	import { ClerkProvider } from 'svelte-clerk';
	import Toasts from '#lib/components/Toasts.svelte';
	import { online } from '#lib/online.svelte';
	import { startUpdateWatcher } from '#lib/pwa';
	import { toaster } from '#lib/toaster';

	let { children } = $props();

	onMount(() => {
		const stop = online.start();
		void startUpdateWatcher((apply) =>
			toaster.create({
				title: 'Update available',
				description: 'A new version of the app is ready.',
				type: 'info',
				duration: Infinity,
				action: { label: 'Reload', onClick: apply }
			})
		);
		return stop;
	});
</script>

<ClerkProvider signInUrl="/sign-in" signUpUrl="/sign-up">
	{@render children()}
</ClerkProvider>
<Toasts />
