<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import LogSessionForm from '#lib/sessions/LogSessionForm.svelte';
	import { safeReturnTo } from '#lib/sessions/log-form';

	let { data } = $props();
	// only an allow-listed internal path (the calendar, the plan, Home); anything else goes to the plan
	const back = $derived(safeReturnTo(page.url.searchParams.get('returnTo')));
	const backName = $derived(back === '/calendar' ? 'Your calendar' : back === '/' ? 'Home' : 'Your plan');
	const leave = () => goto(back, { invalidateAll: true });
</script>

<svelte:head><title>Log a practice session | Trey Thornock Golf</title></svelte:head>

<a class="anchor mb-4 inline-flex min-h-11 items-center gap-1 text-sm font-medium" href={back}><ArrowLeft class="size-4" aria-hidden="true" /> {backName}</a>
<div class="mb-6">
	<p class="eyebrow">Practice</p>
	<h1 class="h1">Log a practice session</h1>
	<p class="mt-2 max-w-2xl text-surface-600-400">Practised outside your plan, or got ahead on it? Log it here. It is a practice session like any other: it shows up on your calendar and Trey can see it. It does not move your lessons forward.</p>
</div>

<LogSessionForm drills={data.drills} initialDate={page.url.searchParams.get('date')} onsaved={leave} oncancel={() => goto(back)} />
