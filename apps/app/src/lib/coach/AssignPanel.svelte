<script lang="ts">
	import { MAX_SPACING_DAYS, addDays, playerLabel, type PlayerSummaryDto } from '@ttg/shared';
	import { toaster } from '#lib/toaster';
	import { ApiError, apiClient } from './coach-client';

	interface Props {
		planId: string;
		sessionCount: number;
		/** Players the coach is working with. */
		players: readonly PlayerSummaryDto[];
		apiBase?: string;
		/** Today in the coach's calendar (decided in the browser). */
		today: string;
	}
	let { planId, sessionCount, players, apiBase = '/api', today }: Props = $props();

	let playerId = $state('');
	// svelte-ignore state_referenced_locally
	let startsOn = $state(today);
	let spacing = $state(1);
	let busy = $state(false);
	let result = $state<string | null>(null);
	let error = $state<string | null>(null);

	const lastDay = $derived(addDays(startsOn, (sessionCount - 1) * spacing));

	const assign = async () => {
		busy = true;
		error = null;
		result = null;
		try {
			const a = await apiClient(apiBase).plans.assign(planId, { playerId, startsOn, spacingDays: spacing });
			const who = players.find((p) => p.id === playerId);
			result = `Assigned to ${who ? playerLabel(who) : 'the player'}: ${a.sessions.length} session${a.sessions.length === 1 ? '' : 's'}, ${a.sessions[0]?.scheduledOn} to ${a.sessions.at(-1)?.scheduledOn}. They have been notified.`;
			toaster.success({ title: 'Plan assigned' });
		} catch (e) {
			error = e instanceof ApiError ? e.message : 'Could not assign the plan. Try again.';
		} finally {
			busy = false;
		}
	};
</script>

<section class="flex flex-col gap-3 rounded-container border border-surface-300-700 bg-surface-100-900 p-4" aria-labelledby="assign-heading" data-assign>
	<h3 id="assign-heading" class="h4">Assign to a player</h3>
	{#if players.length === 0}
		<p class="text-surface-600-400">You are not working with any players yet. Add one from the dashboard first.</p>
	{:else}
		<div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
			<label class="flex flex-col gap-1">
				<span class="text-sm font-semibold text-surface-700-300">Player</span>
				<select class="select min-h-11" bind:value={playerId} data-assign-player>
					<option value="">Choose a player</option>
					{#each players as p (p.id)}<option value={p.id}>{playerLabel(p)}</option>{/each}
				</select>
			</label>
			<label class="flex flex-col gap-1">
				<span class="text-sm font-semibold text-surface-700-300">First session</span>
				<input class="input min-h-11" type="date" bind:value={startsOn} data-assign-start />
			</label>
			<label class="flex flex-col gap-1">
				<span class="text-sm font-semibold text-surface-700-300">Days between sessions</span>
				<input class="input min-h-11" type="number" min="1" max={MAX_SPACING_DAYS} step="1" bind:value={spacing} data-assign-spacing />
			</label>
		</div>
		<p class="text-sm text-surface-600-400">{sessionCount} session{sessionCount === 1 ? '' : 's'}{lastDay ? `, the last on ${lastDay}` : ''}.</p>
		<div>
			<button type="button" class="btn min-h-12 preset-filled-tertiary-500" disabled={busy || !playerId || !startsOn || !lastDay || spacing < 1 || spacing > MAX_SPACING_DAYS} onclick={assign} data-assign-button>
				{busy ? 'Assigning…' : 'Assign plan'}
			</button>
		</div>
	{/if}
	{#if result}<p class="rounded-container border border-success-500 p-3" role="status" data-assign-result>{result}</p>{/if}
	{#if error}<p class="rounded-container border border-error-500 p-3" role="alert">{error}</p>{/if}
</section>
