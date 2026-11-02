<script lang="ts">
	import Library from '@lucide/svelte/icons/library';
	import ClipboardList from '@lucide/svelte/icons/clipboard-list';
	import Film from '@lucide/svelte/icons/film';
	import Mic from '@lucide/svelte/icons/mic';
	import MessageSquare from '@lucide/svelte/icons/message-square';
	import { playerLabel, unreadThreadHref, type PlayerSummaryDto, type UnreadThreadDto, type VideoToRecordDto } from '@ttg/shared';
	import { toaster } from '#lib/toaster';
	import { displayTitle, formatDate, formatDuration } from '#lib/videos/library';
	import { ApiError, apiClient } from './coach-client';

	interface Props {
		players: readonly PlayerSummaryDto[];
		/** Ready swing videos with no recording from the coach yet, newest first. */
		videosToRecord?: readonly VideoToRecordDto[];
		/** Threads (general or per video) with unread messages from players, newest first. */
		unreadThreads?: readonly UnreadThreadDto[];
		/** `/api` in the app, a mock path in dev previews. */
		apiBase?: string;
		/** Where a player's page is (the dev preview points at itself). */
		playerHref?: (id: string) => string;
	}
	let { players: initial, videosToRecord = [], unreadThreads = [], apiBase = '/api', playerHref = (id) => `/coach/players/${id}` }: Props = $props();

	// svelte-ignore state_referenced_locally
	let players = $state<PlayerSummaryDto[]>([...initial]);
	let busy = $state<string | null>(null);

	const mine = $derived(players.filter((p) => p.assigned));
	const others = $derived(players.filter((p) => !p.assigned));
	const newVideos = $derived(mine.reduce((n, p) => n + p.newVideos, 0));
	const unreadTotal = $derived(mine.reduce((n, p) => n + p.unreadMessages, 0));
	const unreadCount = $derived(unreadThreads.reduce((n, t) => n + t.unread, 0));
	const upcoming = $derived(mine.reduce((n, p) => n + p.upcomingSessions, 0));

	/** "Title · Nov 2, 2026 · 0:10"; an untitled video's title is already its date, so the date is not repeated. */
	const videoLine = (v: VideoToRecordDto) =>
		[v.title?.trim() || null, v.title?.trim() ? formatDate(v.createdAt) : displayTitle(v), formatDuration(v.durationMs)].filter(Boolean).join(' · ');

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

	<div class="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
		<section aria-labelledby="record-h" data-to-record>
			<h2 id="record-h" class="h3 mb-3">Videos to record <span class="badge rounded-pill preset-tonal-surface align-middle text-sm tabular-nums" data-to-record-count>{videosToRecord.length}</span></h2>
			{#if videosToRecord.length === 0}
				<p class="rounded-container border border-dashed border-surface-300-700 bg-surface-100-900 p-4 text-surface-600-400" data-to-record-empty>You are all caught up. New swing videos from your players show up here until you record your analysis.</p>
			{:else}
				<ul class="flex flex-col gap-2">
					{#each videosToRecord as v (v.videoId)}
						<li class="relative flex items-center gap-3 rounded-container border border-surface-300-700 bg-surface-100-900 p-3" data-record-row>
							<span class="flex aspect-video w-24 shrink-0 items-center justify-center overflow-hidden rounded-container surface-raised text-surface-600-400">
								{#if v.posterUrl}<img src={v.posterUrl} alt="" class="size-full object-cover" loading="lazy" />{:else}<Film class="size-6" strokeWidth={1.8} aria-hidden="true" />{/if}
							</span>
							<span class="min-w-0 flex-1">
								<a href="/coach/videos/{v.videoId}/analyze" class="block min-h-11 font-medium break-words after:absolute after:inset-0 after:content-[''] focus-visible:after:outline-2 focus-visible:after:outline-tertiary-500">
									{playerLabel({ id: v.playerId, displayName: v.playerName, email: v.playerEmail })}
									<span class="block text-sm font-normal text-surface-600-400">{videoLine(v)}</span>
								</a>
							</span>
							<span class="btn pointer-events-none hidden min-h-11 preset-filled-primary-500 sm:inline-flex" aria-hidden="true"><Mic class="size-4" strokeWidth={1.8} /> Record</span>
						</li>
					{/each}
				</ul>
			{/if}
		</section>

		<section aria-labelledby="unread-h" data-unread-threads>
			<h2 id="unread-h" class="h3 mb-3">Messages from players <span class="badge rounded-pill preset-tonal-surface align-middle text-sm tabular-nums" data-unread-count>{unreadCount}</span></h2>
			{#if unreadThreads.length === 0}
				<p class="rounded-container border border-dashed border-surface-300-700 bg-surface-100-900 p-4 text-surface-600-400" data-unread-empty>No unread messages.</p>
			{:else}
				<ul class="flex flex-col gap-2">
					{#each unreadThreads as t (t.conversationId + (t.videoId ?? ''))}
						<li class="relative flex items-center gap-3 rounded-container border border-surface-300-700 bg-surface-100-900 p-3" data-thread-row>
							<span class="flex size-10 shrink-0 items-center justify-center rounded-full surface-raised text-secondary-500 dark:text-secondary-100"><MessageSquare class="size-5" strokeWidth={1.8} aria-hidden="true" /></span>
							<span class="min-w-0 flex-1">
								<a href={unreadThreadHref(t)} class="block min-h-11 font-medium after:absolute after:inset-0 after:content-[''] focus-visible:after:outline-2 focus-visible:after:outline-tertiary-500">
									<span class="break-words">{playerLabel({ id: t.playerId, displayName: t.playerName, email: t.playerEmail })}</span>
									<span class="block text-sm font-normal text-surface-600-400">{t.videoId ? `About ${t.videoTitle?.trim() || 'a video'}` : 'General chat'} · {formatDate(t.latestAt)}</span>
									<span class="block truncate text-sm font-normal">{t.preview}</span>
								</a>
							</span>
							<span class="badge rounded-pill preset-filled-tertiary-500 tabular-nums" aria-label="{t.unread} unread">{t.unread}</span>
						</li>
					{/each}
				</ul>
			{/if}
		</section>
	</div>

	<h2 class="h3 mb-3">Players</h2>
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
