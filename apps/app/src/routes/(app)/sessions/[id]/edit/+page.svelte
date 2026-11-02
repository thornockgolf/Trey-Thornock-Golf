<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import LogSessionForm from '#lib/sessions/LogSessionForm.svelte';
	import { safeReturnTo } from '#lib/sessions/log-form';

	let { data } = $props();
	const back = $derived(safeReturnTo(page.url.searchParams.get('returnTo')));
	const backName = $derived(back === '/calendar' ? 'Your calendar' : back === '/' ? 'Home' : 'Your plan');
	const leave = () => goto(back, { invalidateAll: true });
</script>

<svelte:head><title>Edit practice session | Trey Thornock Golf</title></svelte:head>

<a class="anchor mb-4 inline-flex min-h-11 items-center gap-1 text-sm font-medium" href={back}><ArrowLeft class="size-4" aria-hidden="true" /> {backName}</a>
<div class="mb-6">
	<p class="eyebrow">Practice</p>
	<h1 class="h1">Edit practice session</h1>
</div>

{#key data.session.id}
	<LogSessionForm drills={data.drills} existing={data.session} onsaved={leave} oncancel={() => goto(back)} />
{/key}
