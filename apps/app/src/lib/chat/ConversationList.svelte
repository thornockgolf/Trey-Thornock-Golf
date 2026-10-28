<script lang="ts">
	import type { ConversationDto } from '@ttg/shared';
	import { timeAgo } from '#lib/notifications/time-ago';
	import { conversationName } from './chat-client';

	let { conversations, activeId = null, base = '/messages' }: { conversations: readonly ConversationDto[]; activeId?: string | null; base?: string } = $props();
</script>

{#if conversations.length === 0}
	<div class="rounded-container border border-dashed border-surface-300-700 bg-surface-100-900 p-8 text-center" data-empty-list>
		<p class="font-display text-lg font-bold text-secondary-500 dark:text-secondary-100">No conversations yet</p>
		<p class="mt-1 text-surface-600-400">A conversation starts when you and a coach are working together.</p>
	</div>
{:else}
	<ul class="flex flex-col gap-1" aria-label="Conversations">
		{#each conversations as c (c.id)}
			<li>
				<a
					href="{base}/{c.id}"
					class="flex min-h-16 items-center gap-3 rounded-container border px-3 py-2.5 no-underline hover:bg-surface-100-900 {c.id === activeId ? 'border-primary-500 bg-surface-100-900' : 'border-transparent'}"
					aria-current={c.id === activeId ? 'page' : undefined}
					data-conversation
				>
					<span class="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary-500 font-display font-bold text-white" aria-hidden="true">{conversationName(c).slice(0, 1).toUpperCase()}</span>
					<span class="min-w-0 flex-1">
						<span class="flex items-baseline justify-between gap-2">
							<span class="truncate font-medium {c.unread > 0 ? 'font-bold' : ''}">{conversationName(c)}</span>
							{#if c.lastMessage}<time class="shrink-0 text-xs text-surface-600-400" datetime={c.lastMessage.createdAt}>{timeAgo(c.lastMessage.createdAt)}</time>{/if}
						</span>
						<span class="block truncate text-sm {c.unread > 0 ? 'font-medium' : 'text-surface-600-400'}">{c.lastMessage ? c.lastMessage.body : 'No messages yet'}</span>
					</span>
					{#if c.unread > 0}<span class="rounded-full bg-tertiary-500 px-2 text-xs leading-5 font-bold text-surface-950" data-unread aria-label="{c.unread} unread">{c.unread}</span>{/if}
				</a>
				{#if c.videoUnread > 0 && c.videoUnreadVideoId}
					<a href="/videos/{c.videoUnreadVideoId}" class="anchor ml-[4.25rem] inline-flex min-h-11 items-center text-sm font-medium" data-video-unread>
						{c.videoUnread} new on {c.videoUnread === 1 ? 'a video' : 'videos'}
					</a>
				{/if}
			</li>
		{/each}
	</ul>
{/if}
