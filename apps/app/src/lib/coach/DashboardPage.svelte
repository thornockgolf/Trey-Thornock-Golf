<script lang="ts">
	import Library from '@lucide/svelte/icons/library';
	import ClipboardList from '@lucide/svelte/icons/clipboard-list';
	import { playerLabel, type PlayerSummaryDto } from '@ttg/shared';
	import { toaster } from '#lib/toaster';
	import { formatDate } from '#lib/videos/library';
	import { ApiError, apiClient } from './coach-client';

	interface Props {
		players: readonly PlayerSummaryDto[];
		/** `/api` in the app, a mock path in dev previews. */
		apiBase?: string;
		/** Where a player's page is (the dev preview points at itself). */
		playerHref?: (id: string) => string;
	}
	let { players: initial, apiBase = '/api', playerHref = (id) => `/coach/players/${id}` }: Props = $props();

	// svelte-ignore state_referenced_locally
	let players = $state<PlayerSummaryDto[]>([...initial]);
	let busy = $state<string | null>(null);

	const mine = $derived(players.filter((p) => p.assigned));
	const others = $derived(players.filter((p) => !p.assigned));
	const newVideos = $derived(mine.reduce((n, p) => n + p.newVideos, 0));
	const unreadTotal = $derived(mine.reduce((n, p) => n + p.unreadMessages, 0));
	const upcoming = $derived(mine.reduce((n, p) => n + p.upcomingSessions, 0));

	const add = async (p: PlayerSummaryDto) => {
		busy = p.id;
		try {
			await apiClient(apiBase).players.assign(p.id);
			players = players.map((x) => (x.id === p.id ? { ...x, assigned: true } : x));
			toaster.success({ title: `You are now working with ${playerLabel(p)}` });
		} catch (e) {
			toaster.error({ title: "Couldn't add the player", description: e instanceof ApiError ? e.message : 'Try again.' });
		} finally {
			busy = null;
		}
	};
</script>

<div class="mx-auto max-w-[1100px]">
	<p class="eyebrow">Coach</p>
	<h1 class="h1">Your players</h1>

	<dl class="mt-4 mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4" data-summary>
		<div class="rounded-container border border-surface-300-700 bg-surface-100-900 p-4"><dt class="text-sm text-surface-600-400">Unread messages</dt><dd class="font-display text-3xl font-bold tabular-nums" data-unread-total>{unreadTotal}</dd></div>
		<div class="rounded-container border border-surface-300-700 bg-surface-100-900 p-4"><dt class="text-sm text-surface-600-400">Players</dt><dd class="font-display text-3xl font-bold tabular-nums">{mine.length}</dd></div>
		<div class="rounded-container border border-surface-300-700 bg-surface-100-900 p-4"><dt class="text-sm text-surface-600-400">New swing videos this week</dt><dd class="font-display text-3xl font-bold tabular-nums">{newVideos}</dd></div>
		<div class="rounded-container border border-surface-300-700 bg-surface-100-900 p-4"><dt class="text-sm text-surface-600-400">Sessions coming up</dt><dd class="font-display text-3xl font-bold tabular-nums">{upcoming}</dd></div>
	</dl>

	<div class="mb-8 flex flex-wrap gap-3">
		<a href="/coach/plans" class="btn min-h-12 preset-filled-primary-500"><ClipboardList class="size-5" strokeWidth={1.8} aria-hidden="true" /> Practice plans</a>
		<a href="/coach/library" class="btn min-h-12 preset-outlined-surface-300-700"><Library class="size-5" strokeWidth={1.8} aria-hidden="true" /> Reference library</a>
	</div>

	{#if mine.length === 0}
		<div class="rounded-container border border-dashed border-surface-300-700 bg-surface-100-900 p-8 text-center" data-empty>
			<p class="font-display text-lg font-bold text-secondary-500 dark:text-secondary-100">No players yet</p>
			<p class="mt-1 text-surface-600-400">{others.length > 0 ? 'Add a player from the list below to see their videos, plans and notes.' : 'Players appear here once they have signed up.'}</p>
		</div>
	{:else}
		<ul class="grid grid-cols-1 gap-4 md:grid-cols-2" aria-label="Your players">
			{#each mine as p (p.id)}
				<li class="relative flex flex-col gap-2 rounded-container border border-surface-300-700 bg-surface-100-900 p-4" data-player>
					<h2 class="font-display text-lg font-bold text-secondary-500 dark:text-secondary-100 break-words">
						<a href={playerHref(p.id)} class="after:absolute after:inset-0 after:content-[''] focus-visible:after:outline-2 focus-visible:after:outline-tertiary-500">{playerLabel(p)}</a>
					</h2>
					<ul class="flex flex-wrap gap-2 text-sm">
						{#if p.unreadMessages > 0}<li class="badge rounded-pill preset-filled-tertiary-500" data-unread>{p.unreadMessages} unread message{p.unreadMessages === 1 ? '' : 's'}</li>{/if}
						{#if p.newVideos > 0}<li class="badge rounded-pill preset-tonal-success">{p.newVideos} new video{p.newVideos === 1 ? '' : 's'}</li>{/if}
						<li class="badge rounded-pill preset-tonal-surface">{p.upcomingSessions} coming up · {p.completedSessions} done</li>
						{#if !p.hasQuestionnaire}<li class="badge rounded-pill preset-tonal-warning">No questionnaire yet</li>{/if}
					</ul>
					<p class="text-sm text-surface-600-400">{p.lastVideoAt ? `Last video ${formatDate(p.lastVideoAt)}` : 'No videos yet'}</p>
				</li>
			{/each}
		</ul>
	{/if}

	{#if others.length > 0}
		<h2 class="h3 mt-10 mb-3">Not working with yet</h2>
		<ul class="flex flex-col gap-2" aria-label="Other players" data-others>
			{#each others as p (p.id)}
				<li class="flex flex-wrap items-center gap-3 rounded-container border border-surface-300-700 bg-surface-100-900 p-3">
					<span class="min-w-0 flex-1"><span class="font-medium break-words">{playerLabel(p)}</span> <span class="text-sm text-surface-600-400">signed up {formatDate(p.joinedAt)}</span></span>
					<button type="button" class="btn min-h-11 preset-filled-primary-500" disabled={busy === p.id} onclick={() => add(p)} data-add-player>{busy === p.id ? 'Adding…' : 'Work with this player'}</button>
				</li>
			{/each}
		</ul>
	{/if}
</div>
