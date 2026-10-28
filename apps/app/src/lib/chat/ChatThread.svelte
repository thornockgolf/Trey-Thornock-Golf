<script lang="ts">
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import Clock from '@lucide/svelte/icons/clock';
	import Play from '@lucide/svelte/icons/play';
	import SendHorizontal from '@lucide/svelte/icons/send-horizontal';
		import { MAX_MESSAGE_LENGTH, type ConversationDto, type MessageDto } from '@ttg/shared';
	import { online } from '#lib/online.svelte';
	import { openChannel, type ChannelStatus } from '#lib/realtime/realtime-client';
	import { dayLabel, formatPlayhead, formatVideoMs, inThread, lastSeq, mergeMessages, videoHref } from '#lib/realtime/chat-state';
	import { unread } from '#lib/realtime/unread.svelte';
	import { ChatError, chatApi, conversationName, type ThreadScope } from './chat-client';

	interface Compose {
		allowed: boolean;
		reason: 'ended' | 'payment' | 'past_due' | null;
	}
	interface Props {
		conversation: ConversationDto;
		messages: readonly MessageDto[];
		hasMore: boolean;
		/** The signed-in user's id: which bubbles are theirs. */
		me: string;
		compose: Compose;
		/**
		 * Which thread of the conversation this shows: `general` (the Messages tab) or one video's. A video thread is
		 * embedded under that video's player: compact, with a chip that seeks the player and a toggle that stamps a
		 * message with the playhead.
		 */
		scope?: ThreadScope;
		/** The player's current time in ms, read when a message is sent with "Attach current time". */
		getPlayheadMs?: () => number | null;
		/** Seek the on-page player (a time chip was tapped). */
		onSeek?: (ms: number) => void;
		apiBase?: string;
		/** Where the list of conversations is (the back link on phones). */
		backHref?: string | null;
		/** Poll interval when the socket is not live. */
		pollMs?: number;
	}
	let { conversation, messages: initial, hasMore: initialHasMore, me, compose, scope = 'general', getPlayheadMs, onSeek, apiBase = '/api', backHref = '/messages', pollMs = 5000 }: Props = $props();

	const videoScope = $derived(scope === 'general' ? null : scope);
	const embedded = $derived(videoScope !== null);
	const api = $derived(chatApi(apiBase, conversation.id, scope));
	// svelte-ignore state_referenced_locally
	let messages = $state<readonly MessageDto[]>(initial);
	// svelte-ignore state_referenced_locally
	let hasMore = $state(initialHasMore);
	/** The playhead the next message is stamped with, taken when "Attach current time" is switched on. */
	let stampedMs = $state<number | null>(null);
	let draft = $state('');
	let sending = $state(false);
	let error = $state<{ message: string; billingUrl?: string } | null>(null);
	let status = $state<ChannelStatus>('connecting');
	let visible = $state(true);
	let list = $state<HTMLElement>();
	let loadingOlder = $state(false);

	const remaining = $derived(MAX_MESSAGE_LENGTH - draft.length);
	const canSend = $derived(compose.allowed && online.current && draft.trim().length > 0 && remaining >= 0 && !sending);

	const nearBottom = () => !list || list.scrollHeight - list.scrollTop - list.clientHeight < 120;
	const toBottom = () => queueMicrotask(() => list && (list.scrollTop = list.scrollHeight));

	const take = (incoming: readonly MessageDto[]) => {
		if (incoming.length === 0) return;
		// the conversation's channel carries every thread; this one keeps its own
		incoming = incoming.filter((m) => inThread(m, scope));
		if (incoming.length === 0) return;
		const stick = nearBottom();
		const next = mergeMessages(messages, incoming);
		if (next === messages) return;
		messages = next;
		if (stick || incoming.some((m) => m.senderId === me)) toBottom();
		// they arrived while this thread is open: it is read
		if (visible && incoming.some((m) => m.senderId !== me)) void read();
	};

	const read = async () => {
		await api.markRead();
		await unread.refresh();
	};

	// Missed messages by id cursor: after a reconnect, when the tab returns, and as the poll fallback.
	const catchUp = async () => {
		try {
			take(await api.after(lastSeq(messages)));
		} catch {
			/* offline or a blip: the next attempt retries */
		}
	};

	$effect(() => {
		toBottom();
		void read();
		const onVis = () => {
			visible = document.visibilityState === 'visible';
			if (visible) {
				void catchUp();
				void read();
			}
		};
		document.addEventListener('visibilitychange', onVis);
		const onOnline = () => void catchUp();
		addEventListener('online', onOnline);
		const handle = openChannel({
			apiBase,
			request: { channel: 'conversation', conversationId: conversation.id },
			events: { 'message.created': (m: MessageDto) => take([m]) },
			onStatus: (s) => {
				const was = status;
				status = s;
				if (s === 'live' && was !== 'connecting') void catchUp();
			}
		});
		return () => {
			document.removeEventListener('visibilitychange', onVis);
			removeEventListener('online', onOnline);
			handle.close();
		};
	});

	$effect(() => {
		if (status === 'live' || !visible || !online.current) return;
		const t = setInterval(() => void catchUp(), pollMs);
		return () => clearInterval(t);
	});

	const send = async () => {
		if (!canSend) return;
		const body = draft.trim();
		sending = true;
		error = null;
		try {
			const ms = videoScope ? stampedMs : null;
			const sent = await api.send({ body, ...(videoScope ? { videoId: videoScope.videoId, ...(ms !== null ? { videoMs: Math.round(ms) } : {}) } : {}) });
			draft = '';
			stampedMs = null;
			take([sent]);
		} catch (e) {
			error = e instanceof ChatError ? { message: e.message, ...(e.billingUrl ? { billingUrl: e.billingUrl } : {}) } : { message: "Couldn't send. Check your connection and try again." };
		} finally {
			sending = false;
		}
	};

	const older = async () => {
		const first = messages[0];
		if (!first || loadingOlder) return;
		loadingOlder = true;
		try {
			const before = list?.scrollHeight ?? 0;
			const page = await api.before(first.seq);
			messages = mergeMessages(messages, page.messages);
			hasMore = page.hasMore;
			queueMicrotask(() => list && (list.scrollTop = list.scrollHeight - before));
		} catch {
			error = { message: "Couldn't load earlier messages." };
		} finally {
			loadingOlder = false;
		}
	};

	const onKey = (e: KeyboardEvent) => {
		if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
			e.preventDefault();
			void send();
		}
	};

	const toggleStamp = () => {
		if (stampedMs !== null) return (stampedMs = null);
		const ms = getPlayheadMs?.();
		stampedMs = ms === null || ms === undefined ? 0 : Math.max(0, Math.round(ms));
	};

	// day dividers between messages sent on different days
	const dayOf = (m: MessageDto) => dayLabel(m.createdAt);
	const reasonText = $derived(
		compose.reason === 'ended'
			? 'This coaching relationship has ended. You can still read the conversation.'
			: compose.reason === 'past_due'
				? 'Your last payment failed, so messaging is paused. Update your card to continue.'
				: compose.reason === 'payment'
					? 'Messaging your coach is part of the coaching membership.'
					: null
	);
</script>

<section
	class="flex flex-col rounded-container border border-surface-300-700 bg-surface-100-900 {embedded ? '' : 'h-[calc(100dvh-61px-104px-env(safe-area-inset-bottom))] min-h-[420px] md:h-[calc(100dvh-61px-80px)] lg:h-[calc(100dvh-61px-80px)]'}"
	aria-label={embedded ? `Messages about this video with ${conversationName(conversation)}` : `Conversation with ${conversationName(conversation)}`}
	data-thread
	data-video-thread={embedded ? '' : undefined}
>
	<header class="flex items-center gap-3 border-b border-surface-300-700 px-3 py-2.5">
		{#if backHref && !embedded}
			<a href={backHref} class="btn-icon size-11 rounded-full hover:preset-tonal-surface lg:hidden" aria-label="All conversations"><ArrowLeft class="size-5" strokeWidth={1.8} aria-hidden="true" /></a>
		{/if}
		<div class="min-w-0 flex-1">
			{#if embedded}
				<h2 class="truncate font-display text-lg font-bold text-secondary-500 dark:text-secondary-100">Messages about this video</h2>
			{:else}
				<h1 class="truncate font-display text-lg font-bold text-secondary-500 dark:text-secondary-100">{conversationName(conversation)}</h1>
			{/if}
			<p class="text-xs text-surface-600-400" data-live-status>
				{#if embedded}With {conversationName(conversation)}{" · "}{/if}{#if !online.current}Offline{:else if status === 'live'}Live{:else if status === 'off' || status === 'down'}Updates every few seconds{:else}Connecting…{/if}
			</p>
		</div>
	</header>

	<div bind:this={list} class="overflow-y-auto overscroll-contain px-3 py-4 {embedded ? 'max-h-[min(24rem,60dvh)] min-h-24' : 'flex-1'}" role="log" aria-live="polite" aria-label="Messages">
		{#if hasMore}
			<div class="mb-3 text-center"><button type="button" class="btn btn-sm min-h-10 preset-tonal-surface" disabled={loadingOlder} onclick={older} data-older>{loadingOlder ? 'Loading…' : 'Earlier messages'}</button></div>
		{/if}
		{#if messages.length === 0}
			<p class="{embedded ? 'py-4' : 'py-10'} text-center text-surface-600-400" data-empty>{embedded ? 'No messages about this video yet. Ask a question or leave a note.' : 'No messages yet. Say hello.'}</p>
		{/if}
		<ol class="flex flex-col gap-1.5">
			{#each messages as m, i (m.id)}
				{@const mine = m.senderId === me}
				{@const href = videoHref(m)}
				{#if i === 0 || dayOf(messages[i - 1]!) !== dayOf(m)}
					<li class="my-2 text-center text-xs font-medium text-surface-600-400" aria-hidden="true">{dayOf(m)}</li>
				{/if}
				<li class="flex {mine ? 'justify-end' : 'justify-start'}">
					<div
						class="max-w-[85%] rounded-container px-3.5 py-2 break-words md:max-w-[70%] {mine ? 'bg-primary-500 text-white' : 'bg-surface-200-800'}"
						data-message
						data-mine={mine}
					>
						{#if embedded && m.videoMs !== null}
							<button
								type="button"
								class="mb-1.5 flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm font-medium {mine ? 'bg-white/20 text-white' : 'bg-surface-100-900 text-secondary-500 dark:text-secondary-100'}"
								aria-label="Jump to {formatPlayhead(m.videoMs)} in the video"
								onclick={() => onSeek?.(m.videoMs!)}
								data-time-chip
							>
								<Play class="size-3.5" strokeWidth={1.8} aria-hidden="true" />
								{formatPlayhead(m.videoMs)}
							</button>
						{:else if href && !embedded}
							<a {href} class="mb-1.5 flex min-h-9 items-center gap-1.5 rounded-full px-2.5 text-sm font-medium no-underline {mine ? 'bg-white/20 text-white' : 'bg-surface-100-900 text-secondary-500 dark:text-secondary-100'}" data-video-ref>
								<Play class="size-3.5" strokeWidth={1.8} aria-hidden="true" />
								{m.videoMs !== null ? `Video at ${formatVideoMs(m.videoMs)}` : 'Video'}
							</a>
						{/if}
						<p class="whitespace-pre-wrap">{m.body}</p>
						<p class="mt-0.5 text-right text-[11px] {mine ? 'text-white/75' : 'text-surface-600-400'}"><time datetime={m.createdAt}>{new Date(m.createdAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</time></p>
					</div>
				</li>
			{/each}
		</ol>
	</div>

	{#if compose.allowed}
		<form class="border-t border-surface-300-700 p-3" onsubmit={(e) => (e.preventDefault(), send())}>
			{#if error}
				<p class="mb-2 text-sm text-error-600-400" role="alert" data-error>{error.message}{#if error.billingUrl} <a href={error.billingUrl} class="anchor font-medium">Go to billing</a>{/if}</p>
			{/if}
			{#if embedded && getPlayheadMs}
				<button
					type="button"
					class="btn mb-2 min-h-11 gap-1.5 text-sm {stampedMs !== null ? 'preset-filled-secondary-500' : 'preset-outlined-surface-300-700'}"
					aria-pressed={stampedMs !== null}
					onclick={toggleStamp}
					data-attach-time
				>
					<Clock class="size-4" strokeWidth={1.8} aria-hidden="true" />
					{stampedMs !== null ? `Attached ${formatPlayhead(stampedMs)}` : 'Attach current time'}
				</button>
			{/if}
			<div class="flex items-end gap-2">
				<label class="sr-only" for={embedded ? 'video-message-body' : 'message-body'}>Message</label>
				<textarea
					id={embedded ? 'video-message-body' : 'message-body'}
					class="textarea max-h-40 min-h-12 flex-1 resize-none"
					rows="1"
					placeholder={online.current ? 'Write a message' : 'You are offline'}
					bind:value={draft}
					onkeydown={onKey}
					disabled={!online.current}
					maxlength={MAX_MESSAGE_LENGTH + 200}
					data-composer
				></textarea>
				<button type="submit" class="btn-icon size-12 rounded-full preset-filled-primary-500" disabled={!canSend} aria-label="Send message" data-send><SendHorizontal class="size-5" strokeWidth={1.8} aria-hidden="true" /></button>
			</div>
			{#if remaining < 200}<p class="mt-1 text-right text-xs {remaining < 0 ? 'text-error-600-400' : 'text-surface-600-400'}">{remaining} characters left</p>{/if}
		</form>
	{:else}
		<div class="border-t border-surface-300-700 p-4 text-center" data-locked>
			<p class="text-surface-600-400">{reasonText}</p>
			{#if compose.reason === 'payment' || compose.reason === 'past_due'}
				<a href="/billing" class="btn mt-3 min-h-12 preset-filled-tertiary-500">{compose.reason === 'past_due' ? 'Fix payment' : 'See membership'}</a>
			{/if}
		</div>
	{/if}
</section>
