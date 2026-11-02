<script lang="ts">
	import type { FavoritesDto, PlanSessionDto } from '@ttg/shared';
	import { FavoritesStore } from './favorites.svelte';
	import PlansView from './PlansView.svelte';
	import { replaceSession } from './sessions';

	/** Test harness: PlansView with the same wiring as the pages (local session state and a favorites store). */
	let { sessions: initial, today, favorites: fav }: { sessions: PlanSessionDto[]; today: string; favorites: FavoritesDto } = $props();
	// svelte-ignore state_referenced_locally
	let sessions = $state<readonly PlanSessionDto[]>(initial);
	// svelte-ignore state_referenced_locally
	const favorites = new FavoritesStore(fav);
</script>

<PlansView {sessions} phases={[]} lessonBySession={{}} {today} {favorites} onChange={(next) => (sessions = replaceSession(sessions, next))} />
