<script lang="ts">
	import type { PlanSessionDto } from '@ttg/shared';
	import AppShell from '#lib/components/AppShell.svelte';
	import PlansView from '#lib/plans/PlansView.svelte';
	import ExtraSessions from '#lib/sessions/ExtraSessions.svelte';
	import WeekTally from '#lib/sessions/WeekTally.svelte';
	import { FavoritesStore } from '#lib/plans/favorites.svelte';
	import { replaceSession } from '#lib/plans/sessions';

	let { data } = $props();

	// svelte-ignore state_referenced_locally
	let sessions = $state<readonly PlanSessionDto[]>(data.sessions);
	const today = $derived(data.today);
	// svelte-ignore state_referenced_locally
	const favorites = new FavoritesStore(data.favorites, '/dev/mock-api');
	const update = (next: PlanSessionDto) => (sessions = replaceSession(sessions, next));
</script>

<svelte:head><title>Plans preview</title></svelte:head>

<AppShell role="player" pathname="/plans">
	<div class="mb-6 flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
		<div>
			<p class="eyebrow">Practice</p>
			<h1 class="h1">Your plan</h1>
			<div class="mt-2"><WeekTally planned={sessions} logged={data.logged ?? []} {today} /></div>
		</div>
		<a class="btn min-h-12 w-full preset-filled-primary-500 sm:w-auto" href="/dev/log" data-log-link>Log a practice session</a>
	</div>
	<PlansView apiBase="/dev/mock-api" {sessions} phases={data.phases} lessonBySession={data.lessonBySession} {today} {favorites} onChange={update}>
		{#snippet between()}<ExtraSessions logged={data.logged ?? []} />{/snippet}
	</PlansView>
</AppShell>
