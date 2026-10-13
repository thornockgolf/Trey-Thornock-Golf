<script lang="ts">
	import CircleCheck from '@lucide/svelte/icons/circle-check';
	import CreditCard from '@lucide/svelte/icons/credit-card';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import type { BillingDto, Product } from '@ttg/shared';
	import { online } from '#lib/online.svelte';
	import { toaster } from '#lib/toaster';
	import { awaitingConfirmation, billingView, formatMoney, paymentLabel } from './billing-view';

	interface Props {
		billing: BillingDto;
		/** `success` or `cancelled`, from the URL Stripe sent the browser back to. It changes nothing by itself. */
		checkout?: string | null;
		apiBase?: string;
		/** Poll interval while waiting for the webhook. */
		pollMs?: number;
	}
	let { billing: initial, checkout = null, apiBase = '/api', pollMs = 2000 }: Props = $props();

	// svelte-ignore state_referenced_locally
	let billing = $state<BillingDto>(initial);
	// svelte-ignore state_referenced_locally
	const before = { assessment: initial.entitlements.assessment, membership: initial.entitlements.membership };
	let busy = $state<Product | 'portal' | null>(null);
	let waited = $state(0);

	const view = $derived(billingView(billing));
	const waiting = $derived(awaitingConfirmation(checkout, billing, before) && waited < 20);

	// Back from Checkout: the webhook decides, so look at Postgres until it has caught up (up to ~40 s).
	$effect(() => {
		if (!waiting) return;
		const t = setInterval(async () => {
			waited += 1;
			try {
				const res = await fetch(`${apiBase}/billing`);
				if (res.ok) billing = (await res.json()) as BillingDto;
			} catch {
				/* retry */
			}
		}, pollMs);
		return () => clearInterval(t);
	});

	const go = async (path: string, body: unknown, kind: Product | 'portal') => {
		busy = kind;
		try {
			const res = await fetch(`${apiBase}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
			const data = (await res.json().catch(() => ({}))) as { url?: string; message?: string };
			if (!res.ok || !data.url) throw new Error(data.message ?? 'Something went wrong');
			window.location.assign(data.url);
		} catch (e) {
			toaster.error({ title: "Couldn't open Stripe", description: e instanceof Error ? e.message : 'Try again.' });
			busy = null;
		}
	};
	const checkoutFor = (product: Product) => go('/billing/checkout', { product }, product);
	const portal = () => go('/billing/portal', {}, 'portal');

	const tone = $derived(view.stage === 'past_due' ? 'border-warning-500' : view.stage === 'member' || view.stage === 'assessment_paid' ? 'border-success-500' : 'border-surface-300-700');
</script>

<div class="mx-auto max-w-[760px]">
	<p class="eyebrow">Account</p>
	<h1 class="h1">Billing</h1>

	{#if checkout === 'cancelled'}
		<p class="mt-3 rounded-container border border-surface-300-700 bg-surface-100-900 p-3 text-sm" role="status" data-checkout-cancelled>Checkout was cancelled. Nothing was charged.</p>
	{:else if checkout === 'success'}
		<p class="mt-3 flex items-center gap-2 rounded-container border border-surface-300-700 bg-surface-100-900 p-3 text-sm" role="status" data-checkout-success>
			{#if waiting}
				<LoaderCircle class="size-4 motion-safe:animate-spin" strokeWidth={1.8} aria-hidden="true" /> Thank you. Confirming your payment with Stripe…
			{:else if billing.entitlements.assessment !== before.assessment || billing.entitlements.membership !== before.membership}
				<CircleCheck class="size-4 text-success-600-400" strokeWidth={1.8} aria-hidden="true" /> Payment confirmed.
			{:else}
				Thank you. Your payment is still being confirmed. This page shows it as soon as Stripe tells us.
			{/if}
		</p>
	{/if}

	<section class="mt-4 rounded-container border-2 {tone} bg-surface-100-900 p-5" aria-labelledby="state-title" data-stage={view.stage}>
		<h2 id="state-title" class="font-display text-xl font-bold text-secondary-500 dark:text-secondary-100">{view.title}</h2>
		<p class="mt-1 text-surface-700-300">{view.note}</p>

		<div class="mt-4 flex flex-wrap gap-3">
			{#if view.stage === 'new'}
				<button type="button" class="btn min-h-12 preset-filled-tertiary-500 font-display font-semibold" disabled={!online.current || busy !== null} onclick={() => checkoutFor('assessment')} data-buy-assessment>
					{busy === 'assessment' ? 'Opening Stripe…' : 'Pay $149 for the assessment'}
				</button>
			{:else if view.stage === 'assessment_paid' || view.stage === 'lapsed'}
				<button type="button" class="btn min-h-12 preset-filled-tertiary-500 font-display font-semibold" disabled={!online.current || busy !== null} onclick={() => checkoutFor('membership')} data-buy-membership>
					{busy === 'membership' ? 'Opening Stripe…' : 'Join the membership, $49 a month'}
				</button>
			{/if}
			{#if billing.canManage}
				<button type="button" class="btn min-h-12 {view.stage === 'past_due' ? 'preset-filled-warning-500' : 'preset-outlined-surface-300-700'}" disabled={!online.current || busy !== null} onclick={portal} data-portal>
					<CreditCard class="size-5" strokeWidth={1.8} aria-hidden="true" /> {busy === 'portal' ? 'Opening…' : view.stage === 'past_due' ? 'Update card' : 'Manage billing'}
				</button>
			{/if}
		</div>
	</section>

	<dl class="mt-4 grid gap-3 sm:grid-cols-2">
		<div class="rounded-container border border-surface-300-700 bg-surface-100-900 p-4">
			<dt class="text-sm text-surface-600-400">Initial Performance Assessment</dt>
			<dd class="font-display text-lg font-bold" data-assessment-state>{billing.entitlements.assessment ? 'Paid' : 'Not paid yet'}</dd>
			<dd class="text-sm text-surface-600-400">Unlocks the questionnaire and swing uploads.</dd>
		</div>
		<div class="rounded-container border border-surface-300-700 bg-surface-100-900 p-4">
			<dt class="text-sm text-surface-600-400">Coaching membership</dt>
			<dd class="font-display text-lg font-bold capitalize" data-membership-state>{billing.subscription ? billing.subscription.status.replace('_', ' ') : 'None'}</dd>
			<dd class="text-sm text-surface-600-400">Unlocks messaging your coach and check-ins.</dd>
		</div>
	</dl>

	<h2 class="h3 mt-8 mb-2">Payments</h2>
	{#if billing.payments.length === 0}
		<p class="text-surface-600-400" data-no-payments>No payments yet.</p>
	{:else}
		<ul class="divide-y divide-surface-200-800 rounded-container border border-surface-300-700 bg-surface-100-900" data-payments>
			{#each billing.payments as p (p.id)}
				<li class="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
					<span>
						<span class="block font-medium">{paymentLabel(p.kind)}</span>
						<span class="block text-sm text-surface-600-400">{p.paidAt ? new Date(p.paidAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'Not paid'}</span>
					</span>
					<span class="text-right">
						<span class="block font-medium tabular-nums">{formatMoney(p.amountCents, p.currency)}</span>
						<span class="badge rounded-pill {p.status === 'paid' ? 'preset-tonal-success' : 'preset-tonal-warning'}">{p.status}</span>
					</span>
				</li>
			{/each}
		</ul>
	{/if}
	<p class="mt-6 text-sm text-surface-600-400">Payments are handled by Stripe. We never see or store your card.</p>
</div>
