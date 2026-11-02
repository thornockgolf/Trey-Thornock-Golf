<script lang="ts">
	import { untrack } from 'svelte';
	import { buildCalendarItems, type CalendarData, type CalendarItem, type CheckInDto } from '@ttg/shared';
	import { localDate } from '#lib/plans/sessions';
	import TagChips from '#lib/sessions/TagChips.svelte';
	import { ADDED_BY_YOU, KIND_CHIP, KIND_LABEL } from './calendar-kinds';
	import CheckInForm from './CheckInForm.svelte';
	import PlanCalendar from './PlanCalendar.svelte';
	import { checkInHref as realCheckInHref, logHref as realLogHref } from '#lib/sessions/log-form';

	interface Props {
		data: CalendarData;
		videos: readonly { id: string; title: string }[];
		apiBase?: string;
		/** Where a session's own page lives (the dev preview points at its own route). */
		sessionHref?: (id: string) => string;
		/** Where a logged session's edit page lives. */
		loggedHref?: (id: string) => string;
		/** Where "Log a session" goes (a day is passed from the day panel). */
		logHref?: (date?: string) => string;
		/** Where "Log a check-in" goes. */
		checkInHref?: (date?: string) => string;
	}
	let { data: initial, videos, apiBase = '/api', sessionHref = (id) => `/plans/sessions/${id}`, loggedHref = (id) => `/sessions/${id}/edit?returnTo=/calendar`, logHref = (date) => realLogHref({ date, returnTo: '/calendar' }), checkInHref = (date) => realCheckInHref({ date, returnTo: '/calendar' }) }: Props = $props();

	// svelte-ignore state_referenced_locally
	let data = $state<CalendarData>(initial);
	let today = $state('');
	let selected = $state('');
	$effect(() => {
		today = localDate();
		untrack(() => {
			selected = selected || today;
		});
	});

	const items = $derived(buildCalendarItems(data));
	const checkIn = (id: string) => data.checkIns.find((c) => c.id === id);
	const result = (id: string) => data.results.find((r) => r.id === id);
	const submitted = (c: CheckInDto) => (data = { ...data, checkIns: data.checkIns.map((x) => (x.id === c.id ? c : x)) });
	let open = $state<string | null>(null);

	const trendText = (id: string) => {
		const r = result(id);
		if (!r || r.value === null) return null;
		if (r.trend === null || r.change === null) return 'First result';
		const unit = r.unit ? ` ${r.unit}` : '';
		const word = r.trend === 'up' ? 'up' : r.trend === 'down' ? 'down' : 'no change';
		return r.trend === 'same' ? `No change from ${r.previousValue}${unit}` : `${word} ${Math.abs(r.change)}${unit} from ${r.previousValue}${unit}`;
	};
</script>

<div class="mx-auto max-w-[900px]">
	<div class="flex flex-wrap items-end justify-between gap-x-4 gap-y-3 mb-3">
		<div>
			<p class="eyebrow">Practice</p>
			<h1 class="h1">Calendar</h1>
		</div>
		<div class="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
			<a class="btn min-h-12 px-2 text-center text-sm leading-tight preset-filled-primary-500 sm:px-4 sm:text-base" href={logHref()} data-log-link>Log practice session</a>
			<a class="btn min-h-12 px-2 text-center text-sm leading-tight preset-outlined-primary-500 sm:px-4 sm:text-base" href={checkInHref()} data-checkin-link>Log check-in</a>
		</div>
	</div>
	<p class="mb-3 hidden max-w-2xl text-surface-600-400 sm:mb-5 sm:block">Your practice sessions, check-ins and tests in one place.</p>

	{#if today}
		<PlanCalendar {items} {sessionHref} {loggedHref} {logHref} {checkInHref} {today} bind:selected>
			{#snippet itemView(it: CalendarItem)}
				<li class="flex flex-col gap-2 rounded-base border border-surface-300-700 bg-surface-50-950 p-3" data-calendar-item data-kind={it.kind}>
					<div class="flex flex-wrap items-center gap-2">
						<span class="badge rounded-pill text-xs font-semibold {KIND_CHIP[it.kind]}">{KIND_LABEL[it.kind]}</span>
						<span class="font-medium break-words">{it.title}</span>
						{#if it.status === 'done' && it.kind !== 'logged'}<span class="text-sm font-semibold text-success-700-300">Done</span>{/if}
						{#if it.kind === 'logged'}<span class="text-xs text-surface-600-400">{ADDED_BY_YOU}</span>{/if}
					</div>
					<TagChips tags={it.tags} />
					{#if it.kind === 'logged'}
						{#if it.detail}<p class="text-sm text-surface-600-400">{it.detail}</p>{/if}
						<div><a class="btn min-h-11 preset-filled-primary-500" href={loggedHref(it.id)} data-open-logged>Open session</a></div>
					{:else if it.kind === 'session'}
						<p class="text-sm text-surface-600-400">{it.detail}</p>
						<div><a class="btn min-h-11 preset-filled-primary-500" href={sessionHref(it.id)} data-open-session>Open session</a></div>
					{:else if it.kind === 'checkin'}
						{@const c = checkIn(it.id)}
						{#if c?.answers}
							<p class="text-sm">Rounds played: {c.answers.roundsPlayed} · Confidence: {c.answers.confidence} of 5</p>
							{#if c.answers.issues}<p class="text-sm break-words text-surface-600-400">{c.answers.issues}</p>{/if}
						{:else if c}
							{#if open === c.id}
								<CheckInForm checkIn={c} {videos} {apiBase} onSubmitted={(s) => ((open = null), submitted(s))} />
							{:else}
								<div><button type="button" class="btn min-h-11 preset-filled-primary-500" onclick={() => (open = c.id)} data-open-checkin>Fill in your check-in</button></div>
							{/if}
						{/if}
					{:else}
						{@const r = result(it.id)}
						{#if r && r.value !== null}
							<p class="text-sm" data-result>{it.detail}{#if trendText(it.id)} <span class="text-surface-600-400">({trendText(it.id)})</span>{/if}</p>
						{:else}
							<p class="text-sm text-surface-600-400">Scheduled. Your coach will record your result.</p>
						{/if}
					{/if}
				</li>
			{/snippet}
		</PlanCalendar>
	{/if}
</div>
