<script lang="ts">
	import CircleAlert from '@lucide/svelte/icons/circle-alert';
	import type { ShellBilling } from './AppShell.svelte';

	let { billing }: { billing: ShellBilling | null } = $props();
	const until = $derived(billing?.graceEndsAt ? new Date(billing.graceEndsAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : null);
</script>

<!-- A failed renewal: chat keeps working for the grace period, then stops until the card is fixed (spec 3.E.2). -->
{#if billing?.pastDue}
	<div role="alert" class="border-b border-warning-300 bg-warning-50 px-4 py-2.5 text-sm text-warning-900 dark:border-warning-700 dark:bg-warning-950 dark:text-warning-100" data-billing-banner>
		<div class="mx-auto flex max-w-app flex-wrap items-center gap-x-3 gap-y-1">
			<CircleAlert class="size-4 shrink-0" strokeWidth={1.8} aria-hidden="true" />
			<span class="min-w-0 flex-1"><strong class="font-semibold">Your last payment failed.</strong> {until ? `Update your card by ${until} to keep messaging your coach.` : 'Update your card to keep messaging your coach.'}</span>
			<a href="/billing" class="btn btn-sm min-h-9 preset-filled-warning-500">Fix payment</a>
		</div>
	</div>
{/if}
