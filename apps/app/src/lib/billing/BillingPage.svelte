<script lang="ts">
	import CircleCheck from '@lucide/svelte/icons/circle-check';
	import CreditCard from '@lucide/svelte/icons/credit-card';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import { onDestroy } from 'svelte';
	import type { BillingDto, CancellationResult, Product } from '@ttg/shared';
	import { surfaceError } from '#lib/form-error';
	import { online } from '#lib/online.svelte';
	import { toaster } from '#lib/toaster';
	import { awaitingConfirmation, billingView, formatMoney, longDate, MEMBERSHIP_PRICE_LABEL, membershipIsLive, paymentLabel } from './billing-view';

	interface Props {
		billing: BillingDto;
		/** `success` or `cancelled`, from the URL Stripe sent the browser back to. It changes nothing by itself. */
		checkout?: string | null;
		apiBase?: string;
		/** Poll interval while waiting for the webhook. */
		pollMs?: number;
	/** How long to wait for the webhook after a cancel or resume before saying the request was received. */
	settleMs?: number;
	}
	let { billing: initial, checkout = null, apiBase = '/api', pollMs = 2000, settleMs = 10_000 }: Props = $props();

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
	// --- cancel and resume ------------------------------------------------------------------
	// Stripe is asked by the server; only its webhook writes the new state. So after "accepted" the page shows a
	// "request received" state and looks at Postgres (GET /billing) until the webhook has landed, up to settleMs.
	let confirmDialog = $state<HTMLDialogElement>();
	let pending = $state<'cancel' | 'resume' | null>(null);
	let slow = $state(false);
	let changing = $state(false);
	let changeError = $state<string | null>(null);
	let errorEl = $state<HTMLElement>();
	let alive = true;
	let runId = 0;
	onDestroy(() => (alive = false));

	const live = $derived(membershipIsLive(billing));
	const ending = $derived(billing.subscription?.cancelAtPeriodEnd === true);
	const endDate = $derived(longDate(billing.subscription?.currentPeriodEnd ?? null));
	const busyAny = $derived(busy !== null || changing || (pending !== null && !slow));

	const refresh = async () => {
		try {
			const res = await fetch(`${apiBase}/billing`);
			if (res.ok) billing = (await res.json()) as BillingDto;
		} catch {
			/* try again on the next tick */
		}
	};

	const settle = async (action: 'cancel' | 'resume', mine: number) => {
		const want = action === 'cancel';
		const deadline = Date.now() + settleMs;
		while (alive && mine === runId) {
			await refresh();
			if (billing.subscription?.cancelAtPeriodEnd === want) {
				pending = null;
				toaster.success({
					title: want ? 'Membership will end' : 'Membership resumed',
					description: want ? `You keep chat and check-ins until ${longDate(billing.subscription.currentPeriodEnd) ?? 'the end of this period'}.` : 'It will renew as usual.'
				});
				return;
			}
			if (Date.now() >= deadline) {
				slow = true; // the webhook has not arrived yet; the request itself was accepted
				return;
			}
			await new Promise((r) => setTimeout(r, pollMs));
		}
	};

	const change = async (action: 'cancel' | 'resume') => {
		changing = true;
		changeError = null;
		slow = false;
		try {
			const res = await fetch(`${apiBase}/billing/${action}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
			const data = (await res.json().catch(() => ({}))) as Partial<CancellationResult> & { message?: string };
			if (!res.ok) throw new Error(data.message ?? 'Something went wrong. Nothing was changed.');
			confirmDialog?.close();
			changing = false;
			pending = action;
			const mine = ++runId;
			void settle(action, mine);
		} catch (e) {
			changing = false;
			confirmDialog?.close();
			changeError = e instanceof Error ? e.message : 'Something went wrong. Nothing was changed.';
			await surfaceError(() => errorEl, action === 'cancel' ? "Couldn't cancel" : "Couldn't resume", changeError);
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
					{busy === 'membership' ? 'Opening Stripe…' : 'Join the membership, {MEMBERSHIP_PRICE_LABEL}'}
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
		<div class="rounded-container border border-surface-300-700 bg-surface-100-900 p-4" data-membership-card>
			<dt class="text-sm text-surface-600-400">Coaching membership · {MEMBERSHIP_PRICE_LABEL}</dt>
			<dd class="font-display text-lg font-bold capitalize" data-membership-state>{billing.subscription ? billing.subscription.status.replace('_', ' ') : 'None'}</dd>
			{#if live}
				<dd class="text-sm text-surface-700-300" data-membership-dates>
					{#if ending}
						Ends on {endDate ?? 'the end of this period'}. You keep chat and check-ins until then.
					{:else}
						{endDate ? `Renews on ${endDate}.` : 'Renews each month.'}
					{/if}
				</dd>
			{:else}
				<dd class="text-sm text-surface-600-400">Unlocks messaging your coach and check-ins.</dd>
			{/if}

			{#if pending}
				<dd class="mt-3 flex items-start gap-2 rounded-container border border-surface-300-700 bg-surface-200-800 p-3 text-sm" role="status" data-change-pending={pending}>
					{#if !slow}<LoaderCircle class="mt-0.5 size-4 shrink-0 motion-safe:animate-spin" strokeWidth={1.8} aria-hidden="true" />{/if}
					<span>
						{#if slow}
							Your request was received; this page will update shortly.
						{:else if pending === 'cancel'}
							Your cancellation request was received. Confirming it with Stripe…
						{:else}
							Your request to resume was received. Confirming it with Stripe…
						{/if}
					</span>
				</dd>
			{/if}

			{#if changeError}
				<dd bind:this={errorEl} tabindex="-1" role="alert" class="mt-3 rounded-container border border-error-500 bg-error-50-950 p-3 text-sm" data-change-error>{changeError}</dd>
			{/if}

			{#if live}
				<dd class="mt-3 flex flex-wrap gap-3">
					{#if ending}
						<button type="button" class="btn min-h-12 w-full preset-filled-primary-500 font-display font-semibold sm:w-auto" disabled={!online.current || busyAny} onclick={() => change('resume')} data-resume>
							{changing ? 'Resuming…' : 'Resume membership'}
						</button>
					{:else}
						<button type="button" class="btn min-h-12 w-full preset-outlined-error-500 font-display font-semibold sm:w-auto" disabled={!online.current || busyAny} onclick={() => ((changeError = null), confirmDialog?.showModal())} data-cancel>
							Cancel membership
						</button>
					{/if}
				</dd>
			{/if}
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

<dialog bind:this={confirmDialog} class="m-auto w-[min(92vw,28rem)] rounded-container border border-surface-300-700 surface-raised p-5 text-inherit backdrop:bg-black/50" aria-labelledby="cancel-title" aria-describedby="cancel-body" data-cancel-dialog>
	<h2 id="cancel-title" class="h3">Cancel your membership?</h2>
	<div id="cancel-body" class="mt-2 space-y-2 text-surface-700-300">
		<p>You keep chat and check-ins until <strong>{endDate ?? 'the end of this period'}</strong>, the end of what you have paid for.</p>
		<p>You won't be charged again. You can resume before then if you change your mind.</p>
	</div>
	<div class="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
		<button type="button" class="btn min-h-12 preset-filled-error-500 font-display font-semibold" disabled={changing} onclick={() => change('cancel')} data-confirm-cancel>
			{changing ? 'Cancelling…' : 'Yes, cancel at period end'}
		</button>
		<!-- svelte-ignore a11y_autofocus -->
		<button type="button" class="btn min-h-12 preset-filled-primary-500 font-display font-semibold" autofocus disabled={changing} onclick={() => confirmDialog?.close()} data-keep>Keep my membership</button>
	</div>
</dialog>
