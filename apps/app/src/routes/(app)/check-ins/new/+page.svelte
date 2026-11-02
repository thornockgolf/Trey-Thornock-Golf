<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import CheckInForm from '#lib/calendar/CheckInForm.svelte';
	import { localDate } from '#lib/plans/sessions';
	import { earliestDate, parseDateParam, safeReturnTo } from '#lib/sessions/log-form';

	let { data } = $props();
	// only an allow-listed internal path; the calendar is the natural way back for a check-in
	const back = $derived(safeReturnTo(page.url.searchParams.get('returnTo'), '/calendar'));
	const backName = $derived(back === '/plans' ? 'Your plan' : back === '/' ? 'Home' : 'Your calendar');
	// the player's own day, decided in the browser; a bad or future ?date= falls back to today
	const today = localDate();
	// svelte-ignore state_referenced_locally
	let date = $state(parseDateParam(page.url.searchParams.get('date'), today));
</script>

<svelte:head><title>Log a check-in | Trey Thornock Golf</title></svelte:head>

<a class="anchor mb-4 inline-flex min-h-11 items-center gap-1 text-sm font-medium" href={back}><ArrowLeft class="size-4" aria-hidden="true" /> {backName}</a>
<div class="mb-6 max-w-2xl">
	<p class="eyebrow">Practice</p>
	<h1 class="h1">Log a check-in</h1>
	<p class="mt-2 text-surface-600-400">Tell Trey how your game is going, any time. It shows on your calendar and he is told.</p>
</div>

<div class="flex max-w-2xl flex-col gap-3">
	<label class="flex flex-col gap-1">
		<span class="font-display text-sm font-semibold">Day of this check-in</span>
		<input class="input min-h-12 w-full text-base sm:w-56" type="date" bind:value={date} max={today} min={earliestDate(today)} required data-date />
	</label>
	<CheckInForm {date} videos={data.videos} onSubmitted={() => goto(back, { invalidateAll: true })} oncancel={() => goto(back)} />
</div>
