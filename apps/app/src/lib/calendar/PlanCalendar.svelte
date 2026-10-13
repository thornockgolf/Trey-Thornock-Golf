<script lang="ts">
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import type { CalendarItem, CalendarKind } from '@ttg/shared';
	import type { Snippet } from 'svelte';
	import {
		dayLabel,
		inMonth,
		itemsByDate,
		kindsOn,
		listGroups,
		monthGrid,
		monthLabel,
		shiftMonth,
		shiftWeek,
		weekDays,
		weekLabel,
		weekdayHeaders,
		type View,
		type WeekStart
	} from './calendar-view';

	interface Props {
		items: readonly CalendarItem[];
		/** Today as the viewer's local day. */
		today: string;
		view?: View;
		/** The day shown in the detail panel, and the anchor of the month and week views. */
		selected?: string;
		weekStart?: WeekStart;
		/** How one item is shown in the detail panel; the default is a plain row. */
		itemView?: Snippet<[CalendarItem]>;
	}
	let { items, today, view = $bindable('month'), selected = $bindable(today), weekStart = 0, itemView }: Props = $props();

	const LABEL: Record<CalendarKind, string> = { session: 'Practice', checkin: 'Check-in', assessment: 'Test' };
	// colour and shape together, so the kinds do not depend on colour alone
	const MARK: Record<CalendarKind, string> = {
		session: 'rounded-full bg-primary-500 dark:bg-primary-300',
		checkin: 'rounded-none bg-tertiary-500',
		assessment: 'rotate-45 rounded-none bg-secondary-500 dark:bg-secondary-200'
	};
	const CHIP: Record<CalendarKind, string> = { session: 'preset-tonal-primary', checkin: 'preset-tonal-tertiary', assessment: 'preset-tonal-secondary' };

	const byDate = $derived(itemsByDate(items));
	const grid = $derived(monthGrid(selected, weekStart));
	const week = $derived(weekDays(selected, weekStart));
	const groups = $derived(listGroups(items, today));
	const dayItems = $derived(byDate.get(selected) ?? []);
	const heading = $derived(view === 'month' ? monthLabel(selected) : view === 'week' ? weekLabel(selected, weekStart) : 'All days');

	const step = (delta: number) => (selected = view === 'week' ? shiftWeek(selected, delta) : shiftMonth(selected, delta));
	const countText = (day: string) => {
		const its = byDate.get(day) ?? [];
		if (its.length === 0) return 'nothing scheduled';
		return its.map((i) => `${LABEL[i.kind]}: ${i.title}${i.status === 'done' ? ' (done)' : ''}`).join('; ');
	};
</script>

{#snippet row(it: CalendarItem)}
	<li class="flex flex-wrap items-center gap-2 rounded-base border border-surface-300-700 bg-surface-50-950 p-2" data-calendar-item data-kind={it.kind}>
		<span class="badge rounded-pill text-xs font-semibold {CHIP[it.kind]}">{LABEL[it.kind]}</span>
		<span class="min-w-0 flex-1 break-words font-medium">{it.title}</span>
		{#if it.detail}<span class="text-sm text-surface-600-400">{it.detail}</span>{/if}
		{#if it.status === 'done'}<span class="text-sm font-semibold text-success-700-300">Done</span>{/if}
	</li>
{/snippet}

{#snippet group(title: string, days: { date: string; items: CalendarItem[] }[])}
	{#if days.length > 0}
		<section aria-label={title}>
			<h3 class="mb-2 font-display font-semibold text-surface-700-300">{title}</h3>
			<ul class="flex flex-col gap-3">
				{#each days as g (g.date)}
					<li>
						<button type="button" class="font-medium {g.date === today ? 'text-primary-700-300' : ''}" onclick={() => (selected = g.date)}>{dayLabel(g.date)}{g.date === today ? ' (today)' : ''}</button>
						<ul class="mt-1 flex flex-col gap-1">{#each g.items as it (it.kind + it.id)}{@render row(it)}{/each}</ul>
					</li>
				{/each}
			</ul>
		</section>
	{/if}
{/snippet}

<div class="flex flex-col gap-3" data-calendar>
	<div class="flex flex-wrap items-center justify-between gap-2">
		<div class="flex items-center gap-1">
			{#if view !== 'list'}
				<button type="button" class="btn-icon size-11 preset-outlined-surface-300-700" aria-label={view === 'week' ? 'Previous week' : 'Previous month'} onclick={() => step(-1)} data-prev><ChevronLeft class="size-5" strokeWidth={1.8} aria-hidden="true" /></button>
			{/if}
			<h2 class="h4 min-w-0 px-2" aria-live="polite" data-calendar-heading>{heading}</h2>
			{#if view !== 'list'}
				<button type="button" class="btn-icon size-11 preset-outlined-surface-300-700" aria-label={view === 'week' ? 'Next week' : 'Next month'} onclick={() => step(1)} data-next><ChevronRight class="size-5" strokeWidth={1.8} aria-hidden="true" /></button>
				<button type="button" class="btn min-h-11 preset-outlined-surface-300-700" onclick={() => (selected = today)}>Today</button>
			{/if}
		</div>
		<div class="flex gap-1" role="group" aria-label="Calendar view">
			{#each [['month', 'Month'], ['week', 'Week'], ['list', 'List']] as [v, name] (v)}
				<button type="button" class="btn min-h-11 {view === v ? 'preset-filled-primary-500' : 'preset-outlined-surface-300-700'}" aria-pressed={view === v} onclick={() => (view = v as View)} data-view={v}>{name}</button>
			{/each}
		</div>
	</div>

	<ul class="flex flex-wrap gap-x-4 gap-y-1 text-xs text-surface-600-400" aria-label="Key">
		{#each Object.keys(LABEL) as k (k)}
			<li class="flex items-center gap-1.5"><span class="inline-block size-2.5 {MARK[k as CalendarKind]}" aria-hidden="true"></span>{LABEL[k as CalendarKind]}</li>
		{/each}
	</ul>

	{#if view === 'month'}
		<div role="grid" aria-label={heading} class="grid grid-cols-7 gap-px overflow-hidden rounded-container border border-surface-300-700 bg-surface-300-700" data-month>
			{#each weekdayHeaders(weekStart) as name (name)}
				<div role="columnheader" class="bg-surface-100-900 py-1 text-center text-xs font-semibold text-surface-600-400" aria-label={name}>{name.slice(0, 1)}</div>
			{/each}
			{#each grid.flat() as day (day)}
				{@const its = byDate.get(day) ?? []}
				<button
					type="button"
					role="gridcell"
					class="flex min-h-14 flex-col items-center gap-1 bg-surface-50-950 p-1 text-sm focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-tertiary-500 {inMonth(day, selected) ? '' : 'opacity-50'} {day === selected ? 'ring-2 ring-primary-500 ring-inset' : ''}"
					aria-label="{dayLabel(day)}, {countText(day)}"
					aria-current={day === today ? 'date' : undefined}
					aria-selected={day === selected}
					onclick={() => (selected = day)}
					data-day={day}
				>
					<span class="flex size-6 items-center justify-center rounded-full tabular-nums {day === today ? 'bg-primary-500 font-bold text-white' : ''}">{Number(day.slice(8))}</span>
					<span class="flex min-h-2.5 flex-wrap justify-center gap-0.5" aria-hidden="true">
						{#each kindsOn(its) as k (k)}<span class="inline-block size-2 {MARK[k]}"></span>{/each}
					</span>
				</button>
			{/each}
		</div>
	{:else if view === 'week'}
		<ol class="flex flex-col gap-2" data-week>
			{#each week as day (day)}
				{@const its = byDate.get(day) ?? []}
				<li class="rounded-container border p-2 {day === selected ? 'border-primary-500' : 'border-surface-300-700'}">
					<button type="button" class="flex min-h-11 w-full items-center justify-between text-left font-display font-semibold {day === today ? 'text-primary-700-300' : ''}" aria-label="{dayLabel(day)}, {countText(day)}" onclick={() => (selected = day)} data-day={day}>
						<span>{dayLabel(day)}{day === today ? ' (today)' : ''}</span>
					</button>
					{#if its.length > 0}<ul class="mt-1 flex flex-col gap-1">{#each its as it (it.kind + it.id)}{@render row(it)}{/each}</ul>{/if}
				</li>
			{/each}
		</ol>
	{:else}
		<div class="flex flex-col gap-4" data-list>
			{#if groups.upcoming.length === 0 && groups.earlier.length === 0}
				<p class="text-surface-600-400">Nothing scheduled yet.</p>
			{/if}
			{@render group('Coming up', groups.upcoming)}
			{@render group('Earlier', groups.earlier)}
		</div>
	{/if}

	{#if view !== 'list'}
		<section class="rounded-container border border-surface-300-700 bg-surface-100-900 p-3" aria-live="polite" aria-label="{dayLabel(selected)}" data-day-detail>
			<h3 class="mb-2 font-display font-semibold">{dayLabel(selected)}{selected === today ? ' (today)' : ''}</h3>
			{#if dayItems.length === 0}
				<p class="text-sm text-surface-600-400">Nothing scheduled.</p>
			{:else}
				<ul class="flex flex-col gap-2">
					{#each dayItems as it (it.kind + it.id)}
						{#if itemView}{@render itemView(it)}{:else}{@render row(it)}{/if}
					{/each}
				</ul>
			{/if}
		</section>
	{/if}
</div>
