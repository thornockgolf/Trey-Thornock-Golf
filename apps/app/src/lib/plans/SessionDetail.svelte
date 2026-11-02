<script lang="ts">
	import type { PlanSessionDto } from '@ttg/shared';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import SessionCard from './SessionCard.svelte';
	import { localDate } from './sessions';

	/** One session on its own page: the same card as `/plans`, with ways back to the calendar and the whole plan. */
	let {
		session: initial,
		calendarHref = '/calendar',
		plansHref = '/plans',
		apiBase = '/api'
	}: { session: PlanSessionDto; calendarHref?: string; plansHref?: string; apiBase?: string } = $props();

	// Local edits (check-offs) layer over the server's copy until the next load.
	// svelte-ignore state_referenced_locally
	let session = $state<PlanSessionDto>(initial);
	$effect(() => {
		session = initial;
	});

	// "Today" is the player's own calendar day, so it is decided in the browser.
	let today = $state('');
	$effect(() => {
		today = localDate();
	});
</script>

<svelte:head><title>{session.title ?? 'Practice session'} | Trey Thornock Golf</title></svelte:head>

<div class="mx-auto max-w-[900px]">
	<nav class="mb-4 flex flex-wrap gap-x-4" aria-label="Back">
		<a class="anchor inline-flex min-h-11 items-center gap-1" href={calendarHref} data-back-calendar><ArrowLeft class="size-4" aria-hidden="true" />Back to calendar</a>
		<a class="anchor inline-flex min-h-11 items-center" href={plansHref} data-back-plans>Your whole plan</a>
	</nav>
	<SessionCard {session} {apiBase} missed={today !== '' && session.scheduledOn < today} onChange={(next) => (session = next)} />
</div>
