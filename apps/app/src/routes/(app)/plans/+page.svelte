<script lang="ts">
	import type { PlanSessionDto } from '@ttg/shared';
	import SessionCard from '#lib/plans/SessionCard.svelte';
	import { groupSessions, localDate, replaceSession } from '#lib/plans/sessions';

	let { data } = $props();

	// Local edits (check-offs) layer over the server's list until the next load.
	// svelte-ignore state_referenced_locally
	let sessions = $state<readonly PlanSessionDto[]>(data.sessions);
	$effect(() => {
		sessions = data.sessions;
	});

	// "Today" is the player's own calendar day, so it is decided in the browser.
	let today = $state('');
	$effect(() => {
		today = localDate();
	});

	const groups = $derived(groupSessions(sessions, today));
	const update = (next: PlanSessionDto) => (sessions = replaceSession(sessions, next));
</script>

<svelte:head><title>Plans | Trey Thornock Golf</title></svelte:head>

<div class="mb-6">
	<p class="eyebrow">Practice</p>
	<h1 class="h1">Your plan</h1>
</div>

{#if data.sessions.length === 0}
	<section class="card surface-raised border border-surface-200-800 rounded-container p-5 md:p-7">
		<h2 class="h2">Nothing scheduled yet</h2>
		<p class="text-surface-600-400">When Trey assigns you a practice plan, your sessions will show up here.</p>
	</section>
{:else if today}
	<div class="flex flex-col gap-8">
		{#if groups.today.length > 0}
			<section class="flex flex-col gap-4" aria-labelledby="today-heading">
				<h2 id="today-heading" class="h2">Today</h2>
				{#each groups.today as s (s.id)}<SessionCard session={s} onChange={update} />{/each}
			</section>
		{/if}
		{#if groups.upcoming.length > 0}
			<section class="flex flex-col gap-4" aria-labelledby="upcoming-heading">
				<h2 id="upcoming-heading" class="h2">Coming up</h2>
				{#each groups.upcoming as s (s.id)}<SessionCard session={s} onChange={update} />{/each}
			</section>
		{/if}
		{#if groups.earlier.length > 0}
			<section class="flex flex-col gap-4" aria-labelledby="earlier-heading">
				<h2 id="earlier-heading" class="h2">Earlier</h2>
				{#each groups.earlier as s (s.id)}<SessionCard session={s} missed onChange={update} />{/each}
			</section>
		{/if}
	</div>
{/if}
