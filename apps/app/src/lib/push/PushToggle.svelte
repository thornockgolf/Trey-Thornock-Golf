<script lang="ts">
	import { onMount } from 'svelte';
	import type { PushConfigDto } from '@ttg/shared';
	import { disablePush, enablePush, fetchPushConfig, pushState, type PushState } from './client';

	/**
	 * Turn browser notifications on or off for this device. Nothing is asked until the person taps the button:
	 * the browser's permission prompt only appears from that tap.
	 */
	let status = $state<PushState | 'loading'>('loading');
	let config = $state<PushConfigDto>({ enabled: false, publicKey: null });
	let busy = $state(false);
	let failed = $state(false);

	onMount(async () => {
		try {
			config = await fetchPushConfig();
			status = await pushState(config);
		} catch {
			status = 'off';
		}
	});

	const run = async (action: (c: PushConfigDto) => Promise<PushState>) => {
		busy = true;
		failed = false;
		try {
			status = await action(config);
		} catch {
			failed = true;
		} finally {
			busy = false;
		}
	};
</script>

<!-- Hidden when the server has push off or the browser cannot do it, so it never offers what will not work. -->
{#if status === 'enabled' || status === 'disabled' || status === 'blocked'}
	<section class="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-container border border-surface-300-700 bg-surface-100-900 p-4" aria-label="Alerts on this device" data-push>
		<div class="min-w-0 flex-1">
			<h2 class="font-display text-base font-bold text-secondary-500 dark:text-secondary-100">Alerts on this device</h2>
			{#if status === 'enabled'}
				<p class="text-sm text-surface-600-400">On. You get a notification for new messages, finished videos and plan news, even when the app is closed.</p>
			{:else if status === 'blocked'}
				<p class="text-sm text-surface-600-400">Blocked in this browser. Allow notifications for this site in the browser settings, then come back.</p>
			{:else}
				<p class="text-sm text-surface-600-400">Get a notification for new messages, finished videos and plan news, even when the app is closed.</p>
			{/if}
			{#if failed}<p class="text-sm text-error-600-400" role="alert">That did not work. Try again in a moment.</p>{/if}
		</div>
		{#if status === 'enabled'}
			<button type="button" class="btn min-h-11 preset-outlined-surface-300-700" disabled={busy} onclick={() => run(disablePush)} data-push-off>Turn off</button>
		{:else if status === 'disabled'}
			<button type="button" class="btn min-h-11 preset-filled-primary-500" disabled={busy} onclick={() => run(enablePush)} data-push-on>Turn on alerts</button>
		{/if}
	</section>
{/if}
