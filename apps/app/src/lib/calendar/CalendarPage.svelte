<script lang="ts">
	import { buildCalendarItems, type CalendarData, type CalendarItem, type CheckInDto } from '@ttg/shared';
	import { localDate } from '#lib/plans/sessions';
	import CheckInForm from './CheckInForm.svelte';
	import PlanCalendar from './PlanCalendar.svelte';
	import type { View } from './calendar-view';

	interface Props {
		data: CalendarData;
		videos: readonly { id: string; title: string }[];
		apiBase?: string;
	}
	let { data: initial, videos, apiBase = '/api' }: Props = $props();

	// svelte-ignore state_referenced_locally
	let data = $state<CalendarData>(initial);
	let today = $state('');
	let selected = $state('');
	let view = $state<View>('month');
	$effect(() => {
		today = localDate();
		selected = selected || today;
		// a narrow screen starts on the list: a month grid of dots is hard to read at 360 px
		if (window.matchMedia('(max-width: 480px)').matches) view = 'list';
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
	<p class="eyebrow">Practice</p>
	<h1 class="h1">Calendar</h1>
	<p class="mt-2 mb-5 max-w-2xl text-surface-600-400">Your practice sessions, check-ins and tests in one place.</p>

	{#if today}
		<PlanCalendar {items} {today} bind:view bind:selected>
			{#snippet itemView(it: CalendarItem)}
				<li class="flex flex-col gap-2 rounded-base border border-surface-300-700 bg-surface-50-950 p-3" data-calendar-item data-kind={it.kind}>
					<div class="flex flex-wrap items-center gap-2">
						<span class="badge rounded-pill text-xs font-semibold {it.kind === 'session' ? 'preset-tonal-primary' : it.kind === 'checkin' ? 'preset-tonal-tertiary' : 'preset-tonal-secondary'}">{it.kind === 'session' ? 'Practice' : it.kind === 'checkin' ? 'Check-in' : 'Test'}</span>
						<span class="font-medium break-words">{it.title}</span>
						{#if it.status === 'done'}<span class="text-sm font-semibold text-success-700-300">Done</span>{/if}
					</div>
					{#if it.kind === 'session'}
						<p class="text-sm text-surface-600-400">{it.detail}</p>
						<a class="anchor text-sm" href="/plans">Open in your plan</a>
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
