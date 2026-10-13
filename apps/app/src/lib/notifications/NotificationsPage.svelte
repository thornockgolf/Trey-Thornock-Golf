<script lang="ts">
	import { describeNotification } from '@ttg/shared';
	import PushToggle from '#lib/push/PushToggle.svelte';
	import { unread } from '#lib/realtime/unread.svelte';
	import { timeAgo } from './time-ago';

	// The app shell keeps `unread` current (counts from Postgres, pushes from Realtime); this page only shows it.
</script>

<div class="mx-auto max-w-[760px]">
	<div class="flex flex-wrap items-end justify-between gap-3">
		<div>
			<p class="eyebrow">Activity</p>
			<h1 class="h1">Notifications</h1>
		</div>
		{#if unread.notifications > 0}<button type="button" class="btn min-h-11 preset-outlined-surface-300-700" onclick={() => unread.markRead()} data-mark-all>Mark all read</button>{/if}
	</div>

	<PushToggle />

	{#if unread.loaded && unread.recent.length === 0}
		<p class="mt-6 rounded-container border border-dashed border-surface-300-700 bg-surface-100-900 p-8 text-center text-surface-600-400" data-empty>Nothing yet. Messages, finished videos, plans and payment news show up here.</p>
	{:else}
		<ul class="mt-4 divide-y divide-surface-200-800 rounded-container border border-surface-300-700 bg-surface-100-900" data-list>
			{#each unread.recent as n (n.id)}
				{@const d = describeNotification(n)}
				<li>
					<a href={d.href ?? '/notifications'} class="flex min-h-16 items-start gap-3 px-4 py-3 hover:bg-surface-200-800" onclick={() => !n.readAt && void unread.markRead([n.id])} data-notification>
						<span class="mt-2 size-2.5 shrink-0 rounded-full {n.readAt ? 'bg-transparent' : 'bg-tertiary-500'}" aria-hidden="true"></span>
						<span class="min-w-0 flex-1">
							<span class="block {n.readAt ? '' : 'font-semibold'} break-words">{d.title}</span>
							{#if n.type === 'message' && typeof n.payload.preview === 'string'}<span class="block truncate text-sm text-surface-600-400">{n.payload.preview}</span>{/if}
							<span class="block text-sm text-surface-600-400"><time datetime={n.createdAt}>{timeAgo(n.createdAt)}</time></span>
						</span>
					</a>
				</li>
			{/each}
		</ul>
	{/if}
</div>
