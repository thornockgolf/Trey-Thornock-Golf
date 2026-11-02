<script lang="ts">
	import type { CheckInDto } from '@ttg/shared';
	import { toaster } from '#lib/toaster';
	import { surfaceError } from '#lib/form-error';
	import { ApiError, apiClient } from '#lib/coach/coach-client';
	import { MAX_ROUNDS, parseRounds } from './check-in-form';

	interface Props {
		/** The scheduled check-in to answer; absent to log a new one for `date`. */
		checkIn?: CheckInDto;
		/** The day of a new check-in (`YYYY-MM-DD`); used when `checkIn` is absent. */
		date?: string;
		oncancel?: () => void;
		/** The player's own videos, to link one. */
		videos: readonly { id: string; title: string }[];
		apiBase?: string;
		onSubmitted: (c: CheckInDto) => void;
	}
	let { checkIn, date, oncancel, videos, apiBase = '/api', onSubmitted }: Props = $props();

	let rounds = $state('0'); // text input: always a string
	let confidence = $state(0);
	let issues = $state('');
	let videoId = $state('');
	let busy = $state(false);
	let error = $state<string | null>(null);
	let billingUrl = $state<string | null>(null);
	let errorEl: HTMLElement | undefined = $state();
	const fail = (message: string) => {
		error = message;
		void surfaceError(() => errorEl, 'Check-in not sent', message);
	};

	const submit = async () => {
		busy = true;
		error = null;
		billingUrl = null;
		let sending = false;
		try {
			if (confidence < 1) return fail('Pick how confident you feel (1 to 5).');
			const roundsPlayed = parseRounds(rounds);
			if (roundsPlayed === 'invalid') return fail(`Rounds played should be a whole number from 0 to ${MAX_ROUNDS}.`);
			const body = { answers: { roundsPlayed, confidence, ...(issues.trim() ? { issues: issues.trim() } : {}), ...(videoId ? { videoId } : {}) } };
			const api = apiClient(apiBase);
			sending = true;
			const saved = checkIn
				? await api.call<CheckInDto>('PATCH', `/check-ins/${checkIn.id}`, body)
				: await api.call<CheckInDto>('POST', '/check-ins/log', { date, ...body });
			sending = false;
			toaster.success({ title: 'Check-in sent', description: 'Your coach has been told.' });
			onSubmitted(saved);
		} catch (e) {
			billingUrl = e instanceof ApiError && e.status === 402 ? (e.billingUrl ?? '/billing') : null;
			if (!(e instanceof ApiError)) console.error('Sending the check-in failed', e);
			fail(e instanceof ApiError ? e.message : sending ? 'Could not send your check-in. Check your connection and try again.' : 'Could not send your check-in. Please try again.');
		} finally {
			busy = false;
		}
	};
</script>

<form class="flex flex-col gap-3" onsubmit={(e) => (e.preventDefault(), void submit())} aria-label="Check-in" data-checkin-form>
	<label class="flex flex-col gap-1">
		<span class="font-display text-sm font-semibold">Rounds played since last time</span>
		<input class="input min-h-11 w-24 text-base" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="2" autocomplete="off" bind:value={rounds} data-rounds />
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
	{#if error}<p class="rounded-base border border-error-200-800 bg-error-50-950 p-3 text-sm text-error-700-300" role="alert" tabindex="-1" bind:this={errorEl} data-checkin-error>{error}{#if billingUrl} <a class="anchor font-medium" href={billingUrl} data-billing-link>Go to billing</a>{/if}</p>{/if}
	<div class="flex flex-wrap gap-3">
		<button type="submit" class="btn min-h-12 preset-filled-primary-500" disabled={busy} data-checkin-submit>{busy ? 'Sending…' : 'Send check-in'}</button>
		{#if oncancel}<button type="button" class="btn min-h-12 preset-tonal-surface" onclick={oncancel} disabled={busy}>Cancel</button>{/if}
	</div>
</form>
