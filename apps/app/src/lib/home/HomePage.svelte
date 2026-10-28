<script lang="ts">
	import type { HomeDto } from '@ttg/shared';
	import { Check, ChevronDown, MapPin, PartyPopper } from '@lucide/svelte';

	let { home }: { home: HomeDto } = $props();

	const lesson = $derived(home.lesson);
	const minutes = $derived(
		lesson ? (lesson.session.durationMin ?? lesson.session.items.reduce((sum, i) => sum + i.minutes, 0)) : 0
	);
	const summary = $derived(
		[minutes > 0 ? `${minutes} min` : '', lesson && lesson.session.items.length > 0 ? `${lesson.session.items.length} ${lesson.session.items.length === 1 ? 'drill' : 'drills'}` : '']
			.filter(Boolean)
			.join(' · ')
	);
	const percent = $derived(lesson && lesson.total > 0 ? Math.round((lesson.completedCount / lesson.total) * 100) : 0);
	const range = (from: number, to: number) => (from === to ? `Lesson ${from}` : `Lessons ${from}-${to}`);
</script>

<p class="eyebrow">Welcome back</p>

<section class="card surface-raised mt-2 rounded-container border border-surface-200-800 p-5 md:p-7" aria-labelledby="hero-heading">
	{#if lesson}
		<h1 id="hero-heading" class="h2">{lesson.isToday ? 'What are we doing today?' : 'Up next'}</h1>
		<p class="mt-3 font-heading text-3xl font-semibold text-primary-700-300">Lesson {lesson.number} of {lesson.total}</p>
		<div
			class="mt-3 h-2.5 overflow-hidden rounded-full bg-surface-200-800"
			role="progressbar"
			aria-label="Lessons completed"
			aria-valuemin={0}
			aria-valuemax={lesson.total}
			aria-valuenow={lesson.completedCount}
			aria-valuetext="{lesson.completedCount} of {lesson.total} lessons completed"
		>
			<div class="h-full rounded-full bg-primary-500 dark:bg-primary-300" style="width: {percent}%"></div>
		</div>
		<p class="mt-1 text-sm text-surface-600-400">{lesson.completedCount} of {lesson.total} done</p>

		<h2 class="h3 mt-5">{lesson.session.title ?? 'Practice session'}</h2>
		<p class="text-sm text-surface-600-400">{summary}</p>

		{#if lesson.session.items.length > 0}
			<ul class="mt-3 flex flex-col gap-2">
				{#each lesson.session.items as item (item.id)}
					{@const done = item.completedAt !== null}
					<li class="flex items-center gap-3" data-done={done}>
						<span
							class="flex size-6 shrink-0 items-center justify-center rounded-full border {done
								? 'border-success-500 bg-success-500 text-white'
								: 'border-surface-400-600'}"
						>
							{#if done}<Check class="size-4" strokeWidth={2.5} aria-hidden="true" />{/if}
						</span>
						<span class="min-w-0 flex-1 {done ? 'text-surface-600-400 line-through' : ''}">{item.name}</span>
						<span class="shrink-0 text-sm text-surface-600-400">{item.minutes} min</span>
						{#if done}<span class="sr-only">Done</span>{/if}
					</li>
				{/each}
			</ul>
		{/if}

		<a class="btn mt-5 min-h-12 w-full preset-filled-primary-500 md:w-auto" href="/plans">
			{lesson.session.items.some((i) => i.completedAt !== null) ? 'Continue session' : 'Start session'}
		</a>
	{:else if home.assignment}
		<div class="flex items-center gap-3">
			<PartyPopper class="size-8 shrink-0 text-warning-600-400" aria-hidden="true" />
			<h1 id="hero-heading" class="h2">Plan complete</h1>
		</div>
		<p class="mt-3">You finished every lesson in {home.assignment.planTitle}. Great work. Send Trey a message to plan what comes next.</p>
		<a class="btn mt-5 min-h-12 w-full preset-filled-primary-500 md:w-auto" href="/messages">Message Trey</a>
	{:else}
		<h1 id="hero-heading" class="h2">Your coach hasn't assigned a plan yet</h1>
		<p class="mt-3 text-surface-600-400">Once Trey sets up your practice plan, today's lesson will show up right here.</p>
		<a class="btn mt-5 min-h-12 w-full preset-filled-primary-500 md:w-auto" href="/messages">Message Trey</a>
	{/if}
</section>

{#if home.phases.length > 0}
	<section class="mt-8" aria-labelledby="roadmap-heading">
		<h2 id="roadmap-heading" class="h2">Your roadmap</h2>
		<ol class="mt-4 flex flex-col">
			{#each home.phases as phase, i (phase.id)}
				{@const last = i === home.phases.length - 1}
				<li class="relative flex gap-4 pb-5" data-state={phase.state} aria-current={phase.state === 'current' ? 'step' : undefined}>
					{#if !last}<span class="absolute top-8 bottom-0 left-4 w-0.5 -translate-x-1/2 bg-surface-300-700" aria-hidden="true"></span>{/if}
					<span
						class="z-10 flex size-8 shrink-0 items-center justify-center rounded-full border-2
						{phase.state === 'done'
							? 'border-success-500 bg-success-500 text-white'
							: phase.state === 'current'
								? 'border-warning-500 bg-warning-500 text-white'
								: 'border-surface-400-600 bg-surface-raised'}"
					>
						{#if phase.state === 'done'}
							<Check class="size-4" strokeWidth={2.5} aria-hidden="true" /><span class="sr-only">Done</span>
						{:else if phase.state === 'current'}
							<MapPin class="size-4" strokeWidth={2.2} aria-hidden="true" />
						{:else}
							<span class="text-xs font-semibold text-surface-600-400" aria-hidden="true">{i + 1}</span>
						{/if}
					</span>

					{#if phase.state === 'current'}
						<div class="min-w-0 flex-1 rounded-container border-2 border-warning-500 bg-warning-50-950 p-4">
							<p class="eyebrow">You are here</p>
							<h3 class="h3">{phase.title}</h3>
							<p class="text-sm font-semibold text-surface-700-300">{range(phase.fromLesson, phase.toLesson)}</p>
							<p class="mt-2">{phase.description}</p>
							{#if phase.measure}<p class="mt-2 text-sm"><span class="font-semibold">How we measure it:</span> {phase.measure}</p>{/if}
						</div>
					{:else if phase.state === 'done'}
						<div class="min-w-0 flex-1 pt-1 text-surface-600-400">
							<h3 class="font-semibold">{phase.title}</h3>
							<p class="text-sm">{range(phase.fromLesson, phase.toLesson)}</p>
						</div>
					{:else}
						<details class="group min-w-0 flex-1">
							<summary class="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
								<span class="min-w-0">
									<span class="block font-semibold">{phase.title}</span>
									<span class="block text-sm text-surface-600-400">{range(phase.fromLesson, phase.toLesson)}</span>
								</span>
								<ChevronDown class="size-5 shrink-0 transition-transform group-open:rotate-180" aria-hidden="true" />
							</summary>
							<div class="pb-2">
								<p>{phase.description}</p>
								{#if phase.measure}<p class="mt-2 text-sm"><span class="font-semibold">How we measure it:</span> {phase.measure}</p>{/if}
							</div>
						</details>
					{/if}
				</li>
			{/each}
		</ol>
	</section>
{/if}
