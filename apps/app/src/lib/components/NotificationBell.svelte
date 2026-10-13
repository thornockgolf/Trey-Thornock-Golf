<script lang="ts">
	import Bell from '@lucide/svelte/icons/bell';
	import { describeNotification } from '@ttg/shared';
	import { unread } from '#lib/realtime/unread.svelte';
	import { timeAgo } from '#lib/notifications/time-ago';

	let open = $state(false);
	let root = $state<HTMLElement>();
	const latest = $derived(unread.recent.slice(0, 8));
	const count = $derived(unread.notifications);

	$effect(() => {
		if (!open) return;
		const away = (e: Event) => root && !root.contains(e.target as Node) && (open = false);
		const esc = (e: KeyboardEvent) => e.key === 'Escape' && (open = false);
		document.addEventListener('pointerdown', away);
		document.addEventListener('keydown', esc);
		return () => {
			document.removeEventListener('pointerdown', away);
			document.removeEventListener('keydown', esc);
		};
	});
</script>

<div class="relative" bind:this={root}>
	<button
		type="button"
		class="btn-icon relative size-11 rounded-full hover:preset-tonal-surface"
		aria-label={count > 0 ? `Notifications, ${count} unread` : 'Notifications'}
		aria-expanded={open}
		aria-controls="notification-panel"
		onclick={() => (open = !open)}
		data-bell
	>
		<Bell class="size-5" strokeWidth={1.8} aria-hidden="true" />
		{#if count > 0}
			<span class="absolute top-1 right-1 flex min-w-[18px] items-center justify-center rounded-full bg-tertiary-500 px-1 text-[11px] leading-[18px] font-bold text-surface-950" data-bell-count>{count > 9 ? '9+' : count}</span>
		{/if}
	</button>

	{#if open}
		<div
			id="notification-panel"
			role="region"
			aria-label="Notifications"
			class="fixed inset-x-3 top-[68px] z-40 max-h-[70dvh] overflow-y-auto rounded-container border border-surface-300-700 surface-raised shadow-lg sm:absolute sm:inset-x-auto sm:top-full sm:right-0 sm:mt-2 sm:w-[22rem]"
		>
			<div class="flex items-center justify-between gap-2 border-b border-surface-200-800 px-4 py-3">
				<h2 class="font-display text-base font-bold text-secondary-500 dark:text-secondary-100">Notifications</h2>
				{#if count > 0}<button type="button" class="anchor min-h-8 text-sm" onclick={() => unread.markRead()} data-mark-all>Mark all read</button>{/if}
			</div>
			{#if latest.length === 0}
				<p class="px-4 py-8 text-center text-surface-600-400">Nothing new. Messages, finished videos and plan updates show up here.</p>
			{:else}
				<ul>
					{#each latest as n (n.id)}
						{@const d = describeNotification(n)}
						<li class="border-b border-surface-200-800 last:border-b-0">
							<svelte:element
								this={d.href ? 'a' : 'div'}
								href={d.href ?? undefined}
								class="flex min-h-14 items-start gap-3 px-4 py-3 hover:bg-surface-100-900"
								onclick={() => {
									open = false;
									if (!n.readAt) void unread.markRead([n.id]);
								}}
								data-notification
							>
								<span class="mt-1.5 size-2.5 shrink-0 rounded-full {n.readAt ? 'bg-transparent' : 'bg-tertiary-500'}" aria-hidden="true"></span>
								<span class="min-w-0 flex-1">
									<span class="block text-sm {n.readAt ? '' : 'font-semibold'} break-words">{d.title}</span>
									{#if n.type === 'message' && typeof n.payload.preview === 'string'}<span class="block truncate text-sm text-surface-600-400">{n.payload.preview}</span>{/if}
									<span class="block text-xs text-surface-600-400"><time datetime={n.createdAt}>{timeAgo(n.createdAt)}</time></span>
								</span>
							</svelte:element>
						</li>
					{/each}
				</ul>
			{/if}
			<a href="/notifications" class="block border-t border-surface-200-800 px-4 py-3 text-center text-sm font-medium anchor" onclick={() => (open = false)}>See all notifications</a>
		</div>
	{/if}
</div>
