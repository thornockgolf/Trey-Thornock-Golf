<script lang="ts">
	import type { PhaseDto, PlanSessionDto } from '@ttg/shared';
	import { ChevronDown } from '@lucide/svelte';
	import SessionCard from './SessionCard.svelte';
	import { formatRange, groupByPhase, groupSessions } from './sessions';

	/** The player's sessions, split by the plan's phases (today's session on top). Without phases: Today, Coming up, Earlier. */
	let {
		sessions,
		phases,
		lessonBySession,
		today,
		onChange
	}: {
		sessions: readonly PlanSessionDto[];
		phases: readonly PhaseDto[];
		lessonBySession: Readonly<Record<string, number>>;
		today: string;
		onChange: (next: PlanSessionDto) => void;
	} = $props();

	const groups = $derived(groupSessions(sessions, today));
	const byPhase = $derived(groupByPhase(sessions, lessonBySession, phases, today));
</script>

<div class="flex flex-col gap-8">
	{#if groups.today.length > 0}
		<section class="flex flex-col gap-4" aria-labelledby="today-heading">
			<h2 id="today-heading" class="h2">Today</h2>
			{#each groups.today as s (s.id)}<SessionCard session={s} {onChange} />{/each}
		</section>
	{/if}

	{#if phases.length === 0}
		{#if groups.upcoming.length > 0}
			<section class="flex flex-col gap-4" aria-labelledby="upcoming-heading">
				<h2 id="upcoming-heading" class="h2">Coming up</h2>
				{#each groups.upcoming as s (s.id)}<SessionCard session={s} {onChange} />{/each}
			</section>
		{/if}
		{#if groups.earlier.length > 0}
			<section class="flex flex-col gap-4" aria-labelledby="earlier-heading">
				<h2 id="earlier-heading" class="h2">Earlier</h2>
				{#each groups.earlier as s (s.id)}<SessionCard session={s} missed {onChange} />{/each}
			</section>
		{/if}
	{:else}
		<div class="flex flex-col gap-4" data-phases>
			{#each byPhase as g (g.id)}
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
						{#each g.sessions as s (s.id)}
							<SessionCard session={s} missed={s.scheduledOn < today} {onChange} />
						{/each}
						{#if g.sessions.length === 0}<p class="text-sm text-surface-600-400">Today's session is at the top of the page.</p>{/if}
					</div>
				</details>
			{/each}
		</div>
	{/if}
</div>
