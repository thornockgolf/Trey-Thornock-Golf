<script lang="ts">
	import type { CheckInDto } from '@ttg/shared';
	import { toaster } from '#lib/toaster';
	import { ApiError, apiClient } from '#lib/coach/coach-client';

	interface Props {
		checkIn: CheckInDto;
		/** The player's own videos, to link one. */
		videos: readonly { id: string; title: string }[];
		apiBase?: string;
		onSubmitted: (c: CheckInDto) => void;
	}
	let { checkIn, videos, apiBase = '/api', onSubmitted }: Props = $props();

	let rounds = $state(0);
	let confidence = $state(0);
	let issues = $state('');
	let videoId = $state('');
	let busy = $state(false);
	let error = $state<string | null>(null);

	const submit = async () => {
		if (confidence < 1) {
			error = 'Pick how confident you feel (1 to 5).';
			return;
		}
		busy = true;
		error = null;
		try {
			const body = { answers: { roundsPlayed: rounds, confidence, ...(issues.trim() ? { issues: issues.trim() } : {}), ...(videoId ? { videoId } : {}) } };
			const saved = await apiClient(apiBase).call<CheckInDto>('PATCH', `/check-ins/${checkIn.id}`, body);
			toaster.success({ title: 'Check-in sent', description: 'Your coach has been told.' });
			onSubmitted(saved);
		} catch (e) {
			error = e instanceof ApiError ? e.message : 'Could not send your check-in. Try again.';
		} finally {
			busy = false;
		}
	};
</script>

<form class="flex flex-col gap-3" onsubmit={(e) => (e.preventDefault(), void submit())} aria-label="Check-in" data-checkin-form>
	<label class="flex flex-col gap-1">
		<span class="font-display text-sm font-semibold">Rounds played since last time</span>
		<input class="input min-h-11 w-24 text-base" type="number" min="0" max="30" step="1" bind:value={rounds} data-rounds />
	</label>
	<fieldset class="flex flex-col gap-1">
		<legend class="font-display text-sm font-semibold">How confident do you feel about your game?</legend>
		<div class="flex gap-1" role="radiogroup" aria-label="Confidence, 1 to 5">
			{#each [1, 2, 3, 4, 5] as n (n)}
				<button type="button" role="radio" aria-checked={confidence === n} class="btn min-h-11 min-w-11 {confidence === n ? 'preset-filled-primary-500' : 'preset-outlined-surface-300-700'}" onclick={() => (confidence = n)} data-confidence={n}>{n}</button>
			{/each}
		</div>
		<span class="text-xs text-surface-600-400">1 = not at all, 5 = very</span>
	</fieldset>
	<label class="flex flex-col gap-1">
		<span class="font-display text-sm font-semibold">Anything going wrong? <span class="font-body font-normal text-surface-600-400">(optional)</span></span>
		<textarea class="textarea min-h-20 text-base" rows="3" maxlength="1000" bind:value={issues} data-issues></textarea>
	</label>
	{#if videos.length > 0}
		<label class="flex flex-col gap-1">
			<span class="font-display text-sm font-semibold">A video to look at <span class="font-body font-normal text-surface-600-400">(optional)</span></span>
			<select class="select min-h-11" bind:value={videoId}>
				<option value="">No video</option>
				{#each videos as v (v.id)}<option value={v.id}>{v.title}</option>{/each}
			</select>
		</label>
	{/if}
	{#if error}<p class="text-sm text-error-700-300" role="alert">{error}</p>{/if}
	<div><button type="submit" class="btn min-h-12 preset-filled-primary-500" disabled={busy} data-checkin-submit>{busy ? 'Sending…' : 'Send check-in'}</button></div>
</form>
