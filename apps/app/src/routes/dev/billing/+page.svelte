<script lang="ts">
	import { page } from '$app/state';
	import AppShell from '#lib/components/AppShell.svelte';
	import BillingPage from '#lib/billing/BillingPage.svelte';
	import type { BillingDto } from '@ttg/shared';

	// /dev/billing?stage=new|assessment|member|past_due ; ?pay=assessment|membership simulates coming back from Stripe
	const stage = $derived(page.url.searchParams.get('stage') ?? 'new');
	const pay = $derived(page.url.searchParams.get('pay'));
	let billing = $state<BillingDto | null>(null);
	$effect(() => {
		billing = null;
		const patch = { new: { assessment: false, membership: false, pastDue: false }, assessment: { assessment: true, membership: false, pastDue: false }, member: { assessment: true, membership: true, pastDue: false }, past_due: { assessment: true, membership: true, pastDue: true } }[stage] ?? { assessment: false, membership: false, pastDue: false };
		void fetch('/dev/mock-api/__set', { method: 'POST', body: JSON.stringify(patch) })
			.then(() => fetch('/dev/mock-api/billing'))
			.then((r) => r.json())
			.then((d) => (billing = d));
	});
</script>

<svelte:head><title>Billing preview</title></svelte:head>

<AppShell role="player" pathname="/billing" billing={billing?.entitlements.pastDue ? { pastDue: true, graceEndsAt: billing.entitlements.graceEndsAt } : null}>
	{#if billing}
		<BillingPage {billing} checkout={pay ? 'success' : page.url.searchParams.get('checkout')} apiBase="/dev/mock-api" pollMs={500} />
	{/if}
</AppShell>
