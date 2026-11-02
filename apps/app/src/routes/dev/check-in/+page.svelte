<script lang="ts">
	import { page } from '$app/state';
	import AppShell from '#lib/components/AppShell.svelte';
	import CheckInForm from '#lib/calendar/CheckInForm.svelte';
	import { localDate } from '#lib/plans/sessions';
	import { earliestDate, parseDateParam } from '#lib/sessions/log-form';

	// Dev-only preview of "Log a check-in" against the mock API: /dev/check-in?date=YYYY-MM-DD
	// (type "pay" in the issues box to see the membership prompt)
	const today = localDate();
	// svelte-ignore state_referenced_locally
	let date = $state(parseDateParam(page.url.searchParams.get('date'), today));
	let saved = $state<string | null>(null);
</script>

<svelte:head><title>Log a check-in preview</title></svelte:head>

<AppShell role="player" pathname="/calendar">
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
		<CheckInForm {date} videos={[{ id: 'v1', title: 'Driver, face on' }]} apiBase="/dev/mock-api" onSubmitted={(c) => (saved = JSON.stringify(c, null, 2))} oncancel={() => (saved = 'cancelled')} />
	</div>
	{#if saved}<pre class="mt-6 max-w-2xl overflow-x-auto rounded-container border border-surface-200-800 p-3 text-xs" data-saved>{saved}</pre>{/if}
</AppShell>
