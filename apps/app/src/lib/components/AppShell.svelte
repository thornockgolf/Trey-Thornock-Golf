<script lang="ts">
	import type { Snippet } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { AppBar, Navigation } from '@skeletonlabs/skeleton-svelte';
	import { useClerkContext } from 'svelte-clerk';
	import type { Role } from '@ttg/shared';
	import { isActive, navFor, overflowItems, type NavItem } from '#lib/nav';
	import { online } from '#lib/online.svelte';
	import Settings from '@lucide/svelte/icons/settings';
	import LogOut from '@lucide/svelte/icons/log-out';
	import AvatarImage from './AvatarImage.svelte';
	import NavIcon from './NavIcon.svelte';
	import { unread } from '#lib/realtime/unread.svelte';
	import BillingBanner from './BillingBanner.svelte';
	import NotificationBell from './NotificationBell.svelte';
	import CoachSearch from '#lib/search/CoachSearch.svelte';
	import OfflineBanner from './OfflineBanner.svelte';
	import FeedbackButton from '#lib/feedback/FeedbackButton.svelte';
	import { feedbackNavItem } from '#lib/feedback/nav';

	export interface ShellBilling {
		pastDue: boolean;
		graceEndsAt: string | null;
	}
	let { role, pathname, billing = null, feedback = false, photoUrl = null, children }: { role: Role; pathname: string; billing?: ShellBilling | null; feedback?: boolean; photoUrl?: string | null; children: Snippet } = $props();

	// Badges and the bell: counts from Postgres, kept fresh by Realtime on the user's channel (previews use the mock API).
	$effect(() => unread.start(page.url.pathname.startsWith('/dev/') ? '/dev/mock-api' : '/api'));

	// TEMPORARY feedback tickets (docs/system/feedback.md): an extra sidebar link, and the floating button below. Previews use the mock API.
	const preview = $derived(page.url.pathname.startsWith('/dev/'));
	const feedbackHref = $derived(preview ? '/dev/feedback' : '/feedback');
	const nav = $derived.by(() => {
		const base = navFor(role);
		return feedback ? { ...base, main: [...base.main, feedbackNavItem(feedbackHref)] } : base;
	});
	// A destination is usable when its screen exists and, if it needs the network, we are online.
	const usable = (item: NavItem) => item.enabled && (online.current || !item.needsNetwork);
	const why = (item: NavItem) => (item.enabled ? 'Unavailable while offline' : 'Coming soon');
	const active = (item: NavItem) => isActive(pathname, item);

	// Account menu (our own avatar button at every width): below md, everything in `main` the bottom bar does not show,
	// plus Manage account and Sign out; from md up just Manage account and Sign out (the rail/sidebar has the links).
	const clerkCtx = useClerkContext();
	const me = $derived(clerkCtx.user);
	const initials = $derived(((me?.firstName?.[0] ?? '') + (me?.lastName?.[0] ?? '') || me?.primaryEmailAddress?.emailAddress?.[0] || '?').toUpperCase());
	const manageAccount = () => {
		moreOpen = false;
		clerkCtx.clerk?.openUserProfile();
	};
	const signOut = () => {
		moreOpen = false;
		clerkCtx.clerk?.signOut({ redirectUrl: '/sign-in' });
	};
	const overflow = $derived(overflowItems(nav));
	const moreActive = $derived(overflow.some(active));
	let moreOpen = $state(false);
	let sheet = $state<HTMLDivElement>();
	const closeMore = (refocus = false) => {
		moreOpen = false;
		if (refocus) document.querySelector<HTMLElement>('button[aria-controls="more-sheet"]')?.focus();
	};
	// Close on navigation; move focus into the sheet when it opens.
	$effect(() => {
		pathname;
		moreOpen = false;
	});
	$effect(() => {
		if (moreOpen) sheet?.querySelector<HTMLElement>('a,button:not([disabled])')?.focus();
	});
	const onKeydown = (e: KeyboardEvent) => {
		if (moreOpen && e.key === 'Escape') closeMore(true);
	};

	const look = (item: NavItem) =>
		active(item) ? 'preset-filled-primary-500' : usable(item) ? '' : 'opacity-50';
</script>

<svelte:window onkeydown={onKeydown} />

<a href="#main" class="skip">Skip to content</a>

<div class="flex min-h-dvh flex-col bg-surface-100-900">
	<!-- Top bar: brand on every breakpoint, account on the right -->
	<AppBar class="sticky top-0 z-30 border-b border-surface-200-800 surface-raised py-2">
		<AppBar.Toolbar class="grid-cols-[auto_1fr_auto] px-1">
			<AppBar.Lead>
				<a href="/" class="flex items-center gap-2.5" aria-label="Trey Thornock Golf home">
					<span class="flex size-10 items-center justify-center overflow-hidden rounded-[10px] bg-white">
						<img src="/images/img-01.png" alt="" width="40" height="40" class="size-full object-contain" />
					</span>
					<span class="leading-tight font-display font-bold tracking-wide text-secondary-500 dark:text-secondary-100 text-[15px]">
						TREY THORNOCK
						<span class="block font-body text-[10.5px] font-medium tracking-[0.14em] text-tertiary-800 dark:text-tertiary-400 uppercase">Golf Coaching</span>
					</span>
				</a>
			</AppBar.Lead>
			<AppBar.Headline class="min-w-0 md:px-4">{#if role === 'coach'}<CoachSearch apiBase={preview ? '/dev/mock-api' : '/api'} go={(href) => goto(href)} {pathname} />{/if}</AppBar.Headline>
			<AppBar.Trail class="items-center">
				{#if role === 'coach'}<span class="badge preset-tonal-tertiary">Coach</span>{/if}
				<NotificationBell />
				<button type="button" class="btn-icon size-11 shrink-0" aria-label="Account menu" aria-haspopup="true" aria-expanded={moreOpen} aria-controls="more-sheet" onclick={() => (moreOpen = !moreOpen)}>
					<span class="flex size-8 items-center justify-center overflow-hidden rounded-full bg-primary-500 text-[13px] font-bold text-white {moreActive ? 'max-md:ring-2 max-md:ring-tertiary-500 max-md:ring-offset-2 max-md:ring-offset-surface-50-950' : ''}">
						<AvatarImage sources={[photoUrl, me?.imageUrl]} {initials} />
					</span>
				</button>
			</AppBar.Trail>
		</AppBar.Toolbar>
	</AppBar>

	<OfflineBanner />
	<BillingBanner {billing} />

	<div class="flex flex-1">
		<!-- md to lg: rail -->
		<Navigation layout="rail" class="sticky top-[61px] hidden h-[calc(100dvh-61px)] overflow-y-auto! border-r border-surface-200-800 surface-raised md:flex lg:hidden" aria-label="Main">
			<Navigation.Content>
				<Navigation.Group>
					<Navigation.Menu class="flex-none justify-start">
						{#each nav.main as item (item.href)}
							{#if usable(item)}
								<Navigation.TriggerAnchor href={item.href} class="aspect-auto! py-2.5 {look(item)}" aria-current={active(item) ? 'page' : undefined}>
									<NavIcon name={item.icon} />
									<Navigation.TriggerText>{item.label}</Navigation.TriggerText>
								</Navigation.TriggerAnchor>
							{:else}
								<Navigation.Trigger disabled class="aspect-auto! py-2.5 {look(item)}" title={why(item)}>
									<NavIcon name={item.icon} />
									<Navigation.TriggerText>{item.label}</Navigation.TriggerText>
								</Navigation.Trigger>
							{/if}
						{/each}
					</Navigation.Menu>
				</Navigation.Group>
			</Navigation.Content>
		</Navigation>

		<!-- lg and up: 242px sidebar -->
		<Navigation layout="sidebar" class="sticky top-[61px] hidden h-[calc(100dvh-61px)] w-[242px] shrink-0 border-r border-surface-200-800 surface-raised lg:flex lg:flex-col" aria-label="Main">
			<Navigation.Content>
				<Navigation.Group>
					<Navigation.Menu>
						{#each nav.main as item (item.href)}
							{#if usable(item)}
								<Navigation.TriggerAnchor href={item.href} class={look(item)} aria-current={active(item) ? 'page' : undefined}>
									<NavIcon name={item.icon} />
									<Navigation.TriggerText>{item.label}</Navigation.TriggerText>
								</Navigation.TriggerAnchor>
							{:else}
								<Navigation.Trigger disabled class="{look(item)} justify-start" title={why(item)}>
									<NavIcon name={item.icon} />
									<Navigation.TriggerText>{item.label}</Navigation.TriggerText>
								</Navigation.Trigger>
							{/if}
						{/each}
					</Navigation.Menu>
				</Navigation.Group>
			</Navigation.Content>
		</Navigation>

		<main id="main" class="mx-auto min-w-0 max-w-app flex-1 px-4 py-6 pb-[calc(104px+env(safe-area-inset-bottom))] md:px-[25px] md:pb-10 lg:px-10">
			{@render children()}
		</main>
	</div>

	<!-- below md: bottom bar, up to 5 items -->
	<Navigation layout="bar" class="fixed inset-x-0 bottom-0 z-30 border-t border-surface-200-800 surface-raised pb-[calc(0.5rem+env(safe-area-inset-bottom))] md:hidden" aria-label="Main">
		<Navigation.Menu>
			{#each nav.bottom as item (item.label)}
				{#if usable(item)}
					<Navigation.TriggerAnchor
						href={item.href}
						class="min-h-[52px] flex-1 {look(item)}"
						aria-current={active(item) ? 'page' : undefined}
					>
						<NavIcon name={item.icon} />
						<Navigation.TriggerText>{item.label}</Navigation.TriggerText>
					</Navigation.TriggerAnchor>
				{:else}
					<Navigation.Trigger
						disabled
						title={why(item)}
						class="min-h-[52px] flex-1 {look(item)}"
					>
						<NavIcon name={item.icon} />
						<Navigation.TriggerText>{item.label}</Navigation.TriggerText>
					</Navigation.Trigger>
				{/if}
			{/each}
		</Navigation.Menu>
	</Navigation>

	{#if moreOpen}
		<!-- Outside tap closes (dimmed below md, invisible from md); the menu drops under the top bar (z-50 over the bar's z-30). -->
		<button type="button" class="fixed inset-0 z-40 cursor-default bg-black/40 md:bg-transparent" aria-label="Close menu" tabindex="-1" onclick={() => closeMore()}></button>
	{/if}
	<div
		id="more-sheet"
		bind:this={sheet}
		role="group"
		aria-label="Account menu"
		hidden={!moreOpen}
		class="fixed inset-x-0 top-[64px] z-50 mx-2 rounded-container border border-surface-300-700 surface-raised p-2 shadow-lg md:inset-x-auto md:right-4 md:mx-0 md:w-60"
	>
		{#if overflow.length}<ul class="m-0 flex md:hidden list-none flex-col p-0">
			{#each overflow as item (item.href)}
				<li>
					{#if usable(item)}
						<a href={item.href} class="flex min-h-11 items-center gap-3 rounded-container px-3 py-2 font-medium {look(item)}" aria-current={active(item) ? 'page' : undefined}>
							<NavIcon name={item.icon} />{item.label}
						</a>
					{:else}
						<span class="flex min-h-11 items-center gap-3 px-3 py-2 font-medium {look(item)}" aria-disabled="true" title={why(item)}>
							<NavIcon name={item.icon} />{item.label}
						</span>
					{/if}
				</li>
			{/each}
		</ul>{/if}
		<ul class="m-0 flex list-none flex-col p-0 {overflow.length ? 'mt-1 border-t border-surface-200-800 pt-1 md:mt-0 md:border-t-0 md:pt-0' : ''}">
			<li><button type="button" class="flex min-h-11 w-full items-center gap-3 rounded-container px-3 py-2 text-left font-medium" onclick={manageAccount}><Settings class="size-5" strokeWidth={1.8} aria-hidden="true" />Manage account</button></li>
			<li><button type="button" class="flex min-h-11 w-full items-center gap-3 rounded-container px-3 py-2 text-left font-medium" onclick={signOut}><LogOut class="size-5" strokeWidth={1.8} aria-hidden="true" />Sign out</button></li>
		</ul>
	</div>

	{#if feedback}
		<FeedbackButton pagePath={pathname + page.url.search} apiBase={preview ? `/dev/mock-api/as-${role}` : '/api'} href={feedbackHref} />
	{/if}
</div>

<style>
	.skip { position: absolute; left: -9999px; top: 0; z-index: 100; background: var(--color-secondary-500); color: #fff; padding: 10px 16px; border-radius: 0 0 8px 0; }
	.skip:focus { left: 0; }
</style>
