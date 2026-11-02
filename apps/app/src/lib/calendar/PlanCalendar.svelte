<script lang="ts">
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import CircleHelp from '@lucide/svelte/icons/circle-help';
	import type { CalendarItem, CalendarKind } from '@ttg/shared';
	import { onDestroy, type Snippet } from 'svelte';
	import { ADDED_BY_YOU, KIND_CHIP, KIND_LABEL, LEGEND_KINDS } from './calendar-kinds';
	import TagChips from '#lib/sessions/TagChips.svelte';
	import { dayLabel, drillSummary, inMonth, itemsByDate, kindsOn, monthGrid, monthLabel, placeCard, shiftMonth, weekdayHeaders, type WeekStart } from './calendar-view';

	interface Props {
		items: readonly CalendarItem[];
		/** Today as the viewer's local day. */
		today: string;
		/** The day shown in the detail panel, and the month the grid shows. */
		selected?: string;
		weekStart?: WeekStart;
		/** How one item is shown in the detail panel; the default is a plain row. */
		itemView?: Snippet<[CalendarItem]>;
		/** Where a session's own page lives; with it, session rows link there (the coach's view has none). */
		sessionHref?: (id: string) => string;
		/** Where a logged session's edit page lives; without it (the coach's view) logged rows are read only. */
		loggedHref?: (id: string) => string;
		/** Where "Log a practice session" goes, for one day or (no date) in general. Absent in the coach's view: players log only their own. */
		logHref?: (date?: string) => string;
		/** Where "Log a check-in" goes; absent in the coach's view too. */
		checkInHref?: (date?: string) => string;
	}
	let { items, today, selected = $bindable(today), weekStart = 0, itemView, sessionHref, loggedHref, logHref, checkInHref }: Props = $props();

	const LABEL = KIND_LABEL;
	// colour and shape together, so the kinds do not depend on colour alone
	const MARK: Record<(typeof LEGEND_KINDS)[number], string> = {
		session: 'rounded-full bg-primary-500 dark:bg-primary-300',
		// a triangle: a third shape (circle, square, diamond), in the gold accent
		checkin: 'rounded-none bg-tertiary-500',
		assessment: 'rotate-45 rounded-none bg-secondary-500 dark:bg-secondary-200'
	};
	const HELP: Record<CalendarKind, string> = {
		session: "A practice session: one from your plan, or one you logged yourself. Only the ones from your plan move your plan progress.",
		logged: '',
		checkin: 'A short note you send Trey: rounds played, issues, confidence (1 to 5) and an optional video link. Trey schedules these.',
		assessment: "A skill test Trey sets up and records the result for. You'll see your result and how it trends."
	};
	// legend help: hover (mouse), tap or Enter (touch, keyboard), keyboard focus; Escape or a tap elsewhere closes it
	type LegendKind = (typeof LEGEND_KINDS)[number];
	let helpOpen = $state<LegendKind | null>(null);
	let helpHover = $state<LegendKind | null>(null);
	let helpFocus = $state<LegendKind | null>(null);
	const helpShown = $derived(helpOpen ?? helpHover ?? helpFocus);
	const CHIP = KIND_CHIP;

	const byDate = $derived(itemsByDate(items));
	const grid = $derived(monthGrid(selected, weekStart));
	const dayItems = $derived(byDate.get(selected) ?? []);
	const heading = $derived(monthLabel(selected));

	const step = (delta: number) => (selected = shiftMonth(selected, delta));
	const countText = (day: string) => {
		const its = byDate.get(day) ?? [];
		if (its.length === 0) return 'nothing scheduled';
		return its.map((i) => `${LABEL[i.kind]}: ${i.title}${i.status === 'done' ? ' (done)' : ''}`).join('; ');
	};

	// A tap selects the day and brings the detail panel into view (the grid cells are small on a phone).
	let panel: HTMLElement | undefined = $state();
	const pick = (day: string) => {
		selected = day;
		closeCard();
		if (!canHover()) requestAnimationFrame(() => panel?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
	};

	// The hover card: only for a mouse (hover-capable device), after a short delay, never for touch.
	const canHover = () => typeof matchMedia === 'function' && matchMedia('(hover: hover) and (pointer: fine)').matches;
	let cardDay = $state<string | null>(null);
	let cardAnchor = $state<HTMLElement | null>(null);
	let card: HTMLElement | undefined = $state();
	let cardPos = $state<{ left: number; top: number } | null>(null);
	let timer: ReturnType<typeof setTimeout> | undefined;
	const closeCard = () => {
		clearTimeout(timer);
		cardDay = null;
		cardAnchor = null;
		cardPos = null;
	};
	const openCard = (anchor: HTMLElement, day: string, delay = 150) => {
		clearTimeout(timer);
		if ((byDate.get(day) ?? []).length === 0) return closeCard();
		timer = setTimeout(() => {
			cardDay = day;
			cardAnchor = anchor;
			cardPos = null;
		}, delay);
	};
	const hoverIn = (e: PointerEvent, day: string) => {
		if (e.pointerType !== 'mouse' || !canHover()) return;
		openCard(e.currentTarget as HTMLElement, day);
	};
	// Place the card once it has a size: below the cell, flipped above or shifted left at the edges.
	$effect(() => {
		if (!card || !cardAnchor || cardPos) return;
		const a = cardAnchor.getBoundingClientRect();
		cardPos = placeCard(a, { width: card.offsetWidth, height: card.offsetHeight }, { width: innerWidth, height: innerHeight });
	});
	onDestroy(() => clearTimeout(timer));
	const cardItems = $derived(cardDay ? (byDate.get(cardDay) ?? []) : []);
</script>

{#snippet rowBody(it: CalendarItem)}
	<span class="badge rounded-pill text-xs font-semibold {CHIP[it.kind]}">{LABEL[it.kind]}</span>
	<span class="min-w-0 flex-1 font-medium break-words">{it.title}</span>
	{#if it.detail}<span class="text-sm text-surface-600-400">{it.detail}</span>{/if}
	{#if it.status === 'done' && it.kind !== 'logged'}<span class="text-sm font-semibold text-success-700-300">Done</span>{/if}
	{#if it.kind === 'logged'}<span class="text-xs text-surface-600-400">{ADDED_BY_YOU}</span>{/if}
	<TagChips tags={it.tags} class="basis-full" />
{/snippet}

{#snippet row(it: CalendarItem)}
	<li data-calendar-item data-kind={it.kind}>
		{#if it.kind === 'session' && sessionHref}
			<a class="flex min-h-11 flex-wrap items-center gap-2 rounded-base border border-surface-300-700 bg-surface-50-950 p-2 hover:border-primary-500" href={sessionHref(it.id)} data-session-link>{@render rowBody(it)}</a>
		{:else if it.kind === 'logged' && loggedHref}
			<a class="flex min-h-11 flex-wrap items-center gap-2 rounded-base border border-surface-300-700 bg-surface-50-950 p-2 hover:border-primary-500" href={loggedHref(it.id)} data-logged-link>{@render rowBody(it)}</a>
		{:else}
			<div class="flex min-h-11 flex-wrap items-center gap-2 rounded-base border border-surface-300-700 bg-surface-50-950 p-2">{@render rowBody(it)}</div>
		{/if}
	</li>
{/snippet}

<svelte:window
	onkeydown={(e) => {
		if (e.key === 'Escape') (helpOpen = helpHover = helpFocus = null), closeCard();
	}}
	onclick={(e) => {
		if (!(e.target as Element).closest('[data-legend]')) helpOpen = null;
	}}
/>

<div class="flex flex-col gap-3" data-calendar>
	<div class="flex items-center gap-1">
		<button type="button" class="btn-icon size-11 preset-outlined-surface-300-700" aria-label="Previous month" onclick={() => step(-1)} data-prev><ChevronLeft class="size-5" strokeWidth={1.8} aria-hidden="true" /></button>
		<h2 class="h4 min-w-0 px-2" aria-live="polite" data-calendar-heading>{heading}</h2>
		<button type="button" class="btn-icon size-11 preset-outlined-surface-300-700" aria-label="Next month" onclick={() => step(1)} data-next><ChevronRight class="size-5" strokeWidth={1.8} aria-hidden="true" /></button>
		<button type="button" class="btn min-h-11 preset-outlined-surface-300-700" onclick={() => (selected = today)}>Today</button>
	</div>

	<div class="relative" data-legend>
		<ul class="flex flex-wrap gap-x-0 text-xs text-surface-600-400" aria-label="Key">
			{#each LEGEND_KINDS as kind (kind)}
				<li>
					<button
						type="button"
						class="flex min-h-11 items-center gap-1.5 rounded-base px-2 hover:bg-surface-100-900 focus-visible:outline-2 focus-visible:outline-tertiary-500"
						aria-expanded={helpOpen === kind}
						aria-describedby="legend-help-{kind}"
						onclick={() => (helpOpen = helpOpen === kind ? null : kind)}
						onmouseenter={() => (helpHover = kind)}
						onmouseleave={() => (helpHover = null)}
						onfocus={(e) => (helpFocus = e.currentTarget.matches(':focus-visible') ? kind : null)}
						onblur={() => (helpFocus = null)}
						data-legend-item={kind}
					>
						<span class="inline-block size-2.5 {MARK[kind]}" aria-hidden="true"></span>{LABEL[kind]}
						<CircleHelp class="size-3.5" strokeWidth={1.8} aria-hidden="true" />
					</button>
					<span id="legend-help-{kind}" class="sr-only">{HELP[kind]}</span>
				</li>
			{/each}
		</ul>
		{#if helpShown}
			<div class="absolute inset-x-0 top-full z-20 mt-1 rounded-base border border-surface-300-700 bg-surface-100-900 p-3 text-sm shadow-lg" aria-hidden="true" data-legend-help={helpShown}>
				<span class="font-semibold">{LABEL[helpShown]}:</span> {HELP[helpShown]}
			</div>
		{/if}
	</div>

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
					aria-describedby={cardDay === day ? 'day-card' : undefined}
					aria-current={day === today ? 'date' : undefined}
					aria-selected={day === selected}
					onclick={() => pick(day)}
					onpointerenter={(e) => hoverIn(e, day)}
					onpointerleave={closeCard}
					onfocus={(e) => e.currentTarget.matches(':focus-visible') && canHover() && openCard(e.currentTarget, day, 0)}
					onblur={closeCard}
					data-day={day}
				>
					<span class="flex size-6 items-center justify-center rounded-full tabular-nums {day === today ? 'bg-primary-500 font-bold text-white' : ''}">{Number(day.slice(8))}</span>
					<span class="flex min-h-2.5 flex-wrap justify-center gap-0.5" aria-hidden="true">
						{#each kindsOn(its) as k (k)}<span class="inline-block size-2 {MARK[k]}" title={LABEL[k]}></span>{/each}
					</span>
				</button>
			{/each}
		</div>

	<section bind:this={panel} class="rounded-container border border-surface-300-700 bg-surface-100-900 p-3" aria-live="polite" aria-label="{dayLabel(selected)}" data-day-detail>
			<h3 class="mb-2 font-display font-semibold">{dayLabel(selected)}{selected === today ? ' (today)' : ''}</h3>
			{#if dayItems.length === 0}
				<p class="text-sm text-surface-600-400">{logHref && selected <= today ? 'Nothing scheduled. Log a practice session if you practised.' : 'Nothing scheduled.'}</p>
			{:else}
				<ul class="flex flex-col gap-2">
					{#each dayItems as it (it.kind + it.id)}
						{#if itemView}{@render itemView(it)}{:else}{@render row(it)}{/if}
					{/each}
				</ul>
			{/if}
			{#if (logHref || checkInHref) && selected <= today}
				<div class="mt-3 grid grid-cols-2 gap-2 sm:flex">
					{#if logHref}<a class="btn min-h-12 px-2 text-center text-sm leading-tight preset-outlined-primary-500 sm:px-4 sm:text-base" href={logHref(selected)} aria-label="Log practice session for {dayLabel(selected)}" data-log-day>Log practice session</a>{/if}
					{#if checkInHref}<a class="btn min-h-12 px-2 text-center text-sm leading-tight preset-outlined-primary-500 sm:px-4 sm:text-base" href={checkInHref(selected)} aria-label="Log check-in for {dayLabel(selected)}" data-checkin-day>Log check-in</a>{/if}
				</div>
			{/if}
		</section>
</div>

{#if cardDay}
	<div
		bind:this={card}
		id="day-card"
		role="tooltip"
		class="pointer-events-none fixed z-30 w-72 max-w-[calc(100vw-1rem)] rounded-container border border-surface-300-700 bg-surface-100-900 p-3 text-sm shadow-lg"
		style="left: {cardPos?.left ?? 0}px; top: {cardPos?.top ?? 0}px; visibility: {cardPos ? 'visible' : 'hidden'}"
		data-day-card={cardDay}
	>
		<p class="mb-2 font-display font-semibold">{dayLabel(cardDay)}{cardDay === today ? ' (today)' : ''}</p>
		<ul class="flex flex-col gap-2">
			{#each cardItems as it (it.kind + it.id)}
				{@const dr = drillSummary(it.drills)}
				<li class="flex flex-col gap-1" data-card-item={it.kind}>
					<div class="flex items-start gap-2">
						<span class="mt-1 inline-block size-2.5 shrink-0 {MARK[it.kind === 'logged' ? 'session' : it.kind]}" aria-hidden="true"></span>
						<span class="min-w-0 flex-1 font-medium break-words">{it.title}</span>
					</div>
					<p class="pl-[1.125rem] text-xs text-surface-600-400">
						{[it.kind === 'logged' ? ADDED_BY_YOU : null, it.detail, it.status === 'done' && it.kind !== 'logged' ? 'Done' : null].filter(Boolean).join(' · ')}
					</p>
					{#if it.tags && it.tags.length > 0}<TagChips tags={it.tags} class="pl-[1.125rem]" />{/if}
					{#if dr.shown.length > 0}
						<ol class="list-decimal pl-[2.25rem] text-xs text-surface-700-300">
							{#each dr.shown as name, i (i)}<li>{name}</li>{/each}
						</ol>
						{#if dr.more > 0}<p class="pl-[1.125rem] text-xs text-surface-600-400">+{dr.more} more</p>{/if}
					{/if}
				</li>
			{/each}
		</ul>
	</div>
{/if}
