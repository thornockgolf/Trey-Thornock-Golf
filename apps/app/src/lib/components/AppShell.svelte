<script lang="ts">
	import type { Snippet } from 'svelte';
	import { AppBar, Navigation } from '@skeletonlabs/skeleton-svelte';
	import { UserButton } from 'svelte-clerk';
	import type { Role } from '@ttg/shared';
	import { isActive, navFor, type NavItem } from '#lib/nav';
	import { online } from '#lib/online.svelte';
	import NavIcon from './NavIcon.svelte';
	import OfflineBanner from './OfflineBanner.svelte';

	let { role, pathname, children }: { role: Role; pathname: string; children: Snippet } = $props();

	const nav = $derived(navFor(role));
	// A destination is usable when its screen exists and, if it needs the network, we are online.
	const usable = (item: NavItem) => item.enabled && (online.current || !item.needsNetwork);
	const why = (item: NavItem) => (item.enabled ? 'Unavailable while offline' : 'Coming soon');
	const active = (item: NavItem) => isActive(pathname, item);

	// Shared look for a navigation destination. Active uses the filled brand preset.
	const state = (item: NavItem) =>
		active(item) ? 'preset-filled-primary-500' : usable(item) ? '' : 'opacity-50';
</script>

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
			<AppBar.Headline></AppBar.Headline>
			<AppBar.Trail class="items-center">
				{#if role === 'coach'}<span class="badge preset-tonal-tertiary">Coach</span>{/if}
				<UserButton />
			</AppBar.Trail>
		</AppBar.Toolbar>
	</AppBar>

	<OfflineBanner />

	<div class="flex flex-1">
		<!-- md to lg: rail -->
		<Navigation layout="rail" class="sticky top-[61px] hidden h-[calc(100dvh-61px)] overflow-y-auto! border-r border-surface-200-800 surface-raised md:flex lg:hidden" aria-label="Main">
			<Navigation.Content>
				<Navigation.Group>
					<Navigation.Menu class="flex-none justify-start">
						{#each nav.main as item (item.href)}
							{#if usable(item)}
								<Navigation.TriggerAnchor href={item.href} class="aspect-auto! py-2.5 {state(item)}" aria-current={active(item) ? 'page' : undefined}>
									<NavIcon name={item.icon} />
									<Navigation.TriggerText>{item.label}</Navigation.TriggerText>
								</Navigation.TriggerAnchor>
							{:else}
								<Navigation.Trigger disabled class="aspect-auto! py-2.5 {state(item)}" title={why(item)}>
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
			<Navigation.Header>
				{#if usable(nav.upload)}
					<a href={nav.upload.href} class="btn w-full preset-filled-tertiary-500 font-display font-semibold">
						<NavIcon name="upload" /> Upload video
					</a>
				{:else}
					<button class="btn w-full preset-filled-tertiary-500 font-display font-semibold opacity-60" disabled title={why(nav.upload)}>
						<NavIcon name="upload" /> Upload video
					</button>
				{/if}
			</Navigation.Header>
			<Navigation.Content>
				<Navigation.Group>
					<Navigation.Menu>
						{#each nav.main as item (item.href)}
							{#if usable(item)}
								<Navigation.TriggerAnchor href={item.href} class={state(item)} aria-current={active(item) ? 'page' : undefined}>
									<NavIcon name={item.icon} />
									<Navigation.TriggerText>{item.label}</Navigation.TriggerText>
								</Navigation.TriggerAnchor>
							{:else}
								<Navigation.Trigger disabled class="{state(item)} justify-start" title={why(item)}>
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

	<!-- below md: bottom bar, 5 items, gold Upload in the center -->
	<Navigation layout="bar" class="fixed inset-x-0 bottom-0 z-30 border-t border-surface-200-800 surface-raised pb-[calc(0.5rem+env(safe-area-inset-bottom))] md:hidden" aria-label="Main">
		<Navigation.Menu>
			{#each nav.bottom as item (item.label)}
				{@const isUpload = item.icon === 'upload'}
				{#if usable(item)}
					<Navigation.TriggerAnchor
						href={item.href}
						class="min-h-[52px] flex-1 {isUpload ? 'preset-filled-tertiary-500' : state(item)}"
						aria-current={active(item) ? 'page' : undefined}
					>
						<NavIcon name={item.icon} />
						<Navigation.TriggerText>{item.label}</Navigation.TriggerText>
					</Navigation.TriggerAnchor>
				{:else}
					<Navigation.Trigger
						disabled
						title={why(item)}
						class="min-h-[52px] flex-1 {isUpload ? 'preset-filled-tertiary-500 opacity-60' : state(item)}"
					>
						<NavIcon name={item.icon} />
						<Navigation.TriggerText>{item.label}</Navigation.TriggerText>
					</Navigation.Trigger>
				{/if}
			{/each}
		</Navigation.Menu>
	</Navigation>
</div>

<style>
	.skip { position: absolute; left: -9999px; top: 0; z-index: 100; background: var(--color-secondary-500); color: #fff; padding: 10px 16px; border-radius: 0 0 8px 0; }
	.skip:focus { left: 0; }
</style>
