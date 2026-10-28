<script lang="ts">
	import type { PlanSessionDto } from '@ttg/shared';
	import AppShell from '#lib/components/AppShell.svelte';
	import PlansView from '#lib/plans/PlansView.svelte';
	import { localDate, replaceSession } from '#lib/plans/sessions';

	let { data } = $props();

	// svelte-ignore state_referenced_locally
	let sessions = $state<readonly PlanSessionDto[]>(data.sessions);
	const today = localDate();
	const update = (next: PlanSessionDto) => (sessions = replaceSession(sessions, next));
</script>

<svelte:head><title>Plans preview</title></svelte:head>

<AppShell role="player" pathname="/plans">
	<div class="mb-6">
		<p class="eyebrow">Practice</p>
		<h1 class="h1">Your plan</h1>
	</div>
	<PlansView {sessions} phases={data.phases} lessonBySession={data.lessonBySession} {today} onChange={update} />
</AppShell>
