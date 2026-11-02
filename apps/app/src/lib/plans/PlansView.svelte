<script lang="ts">
	import type { PhaseDto, PlanSessionDto } from '@ttg/shared';
	import type { Snippet } from 'svelte';
	import { ChevronDown } from '@lucide/svelte';
	import FavoriteButton from './FavoriteButton.svelte';
	import type { FavoritesStore } from './favorites.svelte';
	import SessionCard from './SessionCard.svelte';
	import { favoriteDrillEntries, favoriteSessionList, formatDay, formatRange, groupByPhase, groupSessions, isFinished, isPast, splitByDay } from './sessions';

	/**
	 * The player's plan, newest work first: today's session, then what is coming up (split by the plan's phases when it has
	 * any, else "Coming up"), then Favorites, then a collapsed History of earlier days (unfinished ones can still be checked
	 * off). `between` renders after Favorites and before History, so History is the last thing on the page.
	 */
	let {
		sessions,
		phases,
		lessonBySession,
		today,
		apiBase = '/api',
		favorites,
		between,
		onChange
	}: {
		sessions: readonly PlanSessionDto[];
		phases: readonly PhaseDto[];
		lessonBySession: Readonly<Record<string, number>>;
		today: string;
		apiBase?: string;
		favorites?: FavoritesStore;
		between?: Snippet;
		onChange: (next: PlanSessionDto) => void;
	} = $props();

	const split = $derived(splitByDay(sessions, today));
	const groups = $derived(groupSessions(split.upcoming, today));
	// Phase progress counts every session of the phase, past ones too; only the upcoming ones are listed inside.
	const byPhase = $derived(groupByPhase(sessions, lessonBySession, phases, today));
	const shownPhases = $derived(byPhase.filter((g) => g.current || g.hasToday || g.sessions.some((s) => !isPast(s, today))));
	const unfinished = $derived(split.history.filter((s) => !isFinished(s)).length);
	const favSessions = $derived(favorites ? favoriteSessionList(sessions, favorites.sessionIds, today) : []);
	const favDrills = $derived(favorites ? favoriteDrillEntries(sessions, favorites.drillIds, today) : []);
	const favCount = $derived(favSessions.length + favDrills.length);

	/** Opens every collapsed section around a session's card, scrolls to it and focuses it. */
	const reveal = (sessionId: string) => {
		const card = document.getElementById(`session-${sessionId}`);
		if (!card) return;
		for (let d = card.closest('details'); d; d = d.parentElement?.closest('details') ?? null) d.open = true;
		card.scrollIntoView({ block: 'center', behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
		card.focus({ preventScroll: true });
	};
</script>

<div class="flex flex-col gap-8">
	{#if sessions.length > 0 && split.upcoming.length === 0}
		<p class="rounded-container border border-surface-200-800 p-4 text-surface-700-300" data-caught-up>Nothing coming up. Your earlier sessions are in History below.</p>
	{/if}

	{#if groups.today.length > 0}
		<section class="flex flex-col gap-4" aria-labelledby="today-heading">
			<h2 id="today-heading" class="h2">Today</h2>
			{#each groups.today as s (s.id)}<SessionCard session={s} {apiBase} {favorites} {onChange} />{/each}
		</section>
	{/if}

	{#if phases.length === 0}
		{#if groups.upcoming.length > 0}
			<section class="flex flex-col gap-4" aria-labelledby="upcoming-heading">
				<h2 id="upcoming-heading" class="h2">Coming up</h2>
				{#each groups.upcoming as s (s.id)}<SessionCard session={s} {apiBase} {favorites} {onChange} />{/each}
			</section>
		{/if}
	{:else}
		<div class="flex flex-col gap-4" data-phases>
			{#each shownPhases as g (g.id)}
				{@const percent = g.total > 0 ? Math.round((g.done / g.total) * 100) : 0}
				<details
					class="group card surface-raised rounded-container border border-surface-200-800 {g.current ? 'border-primary-500' : ''}"
					open={g.current}
					data-phase={g.id}
					data-current={g.current}
				>
					<summary class="flex min-h-11 cursor-pointer list-none items-start gap-3 p-4 md:p-5 [&::-webkit-details-marker]:hidden">
						<div class="min-w-0 flex-1">
							<h2 class="h3 flex flex-wrap items-center gap-x-2">
								{g.title}
								{#if g.current}<span class="chip preset-filled-primary-500 text-xs">Current</span>{/if}
							</h2>
							<p class="mt-1 text-sm text-surface-600-400">
								{[g.fromLesson !== null && g.toLesson !== null ? `Lessons ${g.fromLesson}-${g.toLesson}` : '', g.firstDay && g.lastDay ? formatRange(g.firstDay, g.lastDay) : ''].filter(Boolean).join(' · ')}
							</p>
							<div class="mt-2 flex items-center gap-3">
								<div
									class="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-200-800"
									role="progressbar"
									aria-label="{g.title} progress"
									aria-valuemin={0}
									aria-valuemax={g.total}
									aria-valuenow={g.done}
									aria-valuetext="{g.done} of {g.total} done"
								>
									<div class="h-full rounded-full bg-primary-500 dark:bg-primary-300" style="width: {percent}%"></div>
								</div>
								<p class="shrink-0 text-sm font-semibold">{g.done} of {g.total} done</p>
							</div>
						</div>
						<ChevronDown class="mt-1 size-5 shrink-0 transition-transform group-open:rotate-180" aria-hidden="true" />
					</summary>
					<div class="flex flex-col gap-4 border-t border-surface-200-800 p-4 md:p-5">
						{#if g.description}<p class="text-surface-700-300">{g.description}</p>{/if}
						{#if g.measure}<p class="text-sm text-surface-600-400"><span class="font-semibold">How we measure it:</span> {g.measure}</p>{/if}
						{#each g.sessions.filter((s) => !isPast(s, today)) as s (s.id)}
							<SessionCard session={s} {apiBase} {favorites} {onChange} />
						{/each}
						{#if !g.sessions.some((s) => !isPast(s, today))}
							<p class="text-sm text-surface-600-400">{g.hasToday ? "Today's session is at the top of the page." : 'Nothing left in this phase.'}</p>
						{/if}
					</div>
				</details>
			{/each}
		</div>
	{/if}

	{#if favorites && favCount > 0}
		<section class="flex flex-col gap-3" aria-labelledby="favorites-heading" data-favorites>
			<h2 id="favorites-heading" class="h2">Favorites <span class="text-base font-normal text-surface-600-400">({favCount})</span></h2>
			<ul class="flex flex-col gap-2">
				{#each favSessions as s (s.id)}
					<li class="flex items-center gap-1 rounded-container border border-surface-200-800 surface-raised py-1 pr-1 pl-4" data-favorite-session={s.id}>
						<div class="min-w-0 flex-1">
							<p class="eyebrow">Session · {formatDay(s.scheduledOn)}</p>
							<p class="truncate font-semibold">{s.title ?? 'Practice session'}</p>
						</div>
						<button type="button" class="btn min-h-11 shrink-0 preset-tonal" onclick={() => reveal(s.id)} aria-label="Show {s.title ?? 'Practice session'} in the page">Show</button>
						<FavoriteButton pressed={true} label={s.title ?? 'Practice session'} onToggle={() => favorites.set('session', s.id, false)} />
					</li>
				{/each}
				{#each favDrills as d (d.drillId)}
					<li class="flex items-center gap-1 rounded-container border border-surface-200-800 surface-raised py-1 pr-1 pl-4" data-favorite-drill={d.drillId}>
						<div class="min-w-0 flex-1">
							<p class="eyebrow">Drill · {d.minutes} min</p>
							<p class="truncate font-semibold">{d.name}</p>
							<p class="text-sm text-surface-600-400">In {d.session.title ?? 'Practice session'}, {formatDay(d.session.scheduledOn)}</p>
						</div>
						<button type="button" class="btn min-h-11 shrink-0 preset-tonal" onclick={() => reveal(d.session.id)} aria-label="Show {d.name} in {d.session.title ?? 'Practice session'}">Show</button>
						<FavoriteButton pressed={true} label={d.name} onToggle={() => favorites.set('drill', d.drillId, false)} />
					</li>
				{/each}
			</ul>
		</section>
	{/if}

	{@render between?.()}

	{#if split.history.length > 0}
		<details class="group card surface-raised rounded-container border border-surface-200-800" data-history>
			<summary class="flex min-h-11 cursor-pointer list-none items-center gap-3 p-4 md:p-5 [&::-webkit-details-marker]:hidden">
				<div class="min-w-0 flex-1">
					<h2 id="history-heading" class="h3">History <span class="text-base font-normal text-surface-600-400">({split.history.length})</span></h2>
					<p class="text-sm text-surface-600-400">
						Earlier sessions, most recent first{#if unfinished > 0}. {unfinished} not finished{/if}
					</p>
				</div>
				<ChevronDown class="size-5 shrink-0 transition-transform group-open:rotate-180" aria-hidden="true" />
			</summary>
			<div class="flex flex-col gap-4 border-t border-surface-200-800 p-4 md:p-5">
				{#each split.history as s (s.id)}
					<SessionCard session={s} missed {apiBase} {favorites} {onChange} />
				{/each}
			</div>
		</details>
	{/if}
</div>
