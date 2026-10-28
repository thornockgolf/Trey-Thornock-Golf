<script lang="ts">
	import type { PlanSessionDto } from '@ttg/shared';
	import PlansView from '#lib/plans/PlansView.svelte';
	import { localDate, replaceSession } from '#lib/plans/sessions';

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
	<PlansView {sessions} phases={data.phases} lessonBySession={data.lessonBySession} {today} onChange={update} />
{/if}
