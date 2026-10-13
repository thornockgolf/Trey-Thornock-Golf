<script lang="ts">
	import { page } from '$app/state';
	import AppShell from '#lib/components/AppShell.svelte';
	import ChatThread from '#lib/chat/ChatThread.svelte';
	import ConversationList from '#lib/chat/ConversationList.svelte';
	import { CONVERSATION_ID, COACH_ID, PLAYER_ID } from './ids';

	const as = $derived(page.url.searchParams.get('as') === 'coach' ? 'coach' : 'player');
	const view = $derived(page.url.searchParams.get('view') ?? 'thread');
	const lock = $derived(page.url.searchParams.get('lock'));
	const attach = $derived(page.url.searchParams.get('video') ? { videoId: page.url.searchParams.get('video')!, videoMs: Number(page.url.searchParams.get('ms') ?? 0) } : null);

	let loaded = $state<{ messages: any[]; conversation: any } | null>(null);
	const q = $derived(`?as=${as}`);
	$effect(() => {
		loaded = null;
		void fetch(`/dev/mock-api/conversations/${CONVERSATION_ID}/messages${q}`)
			.then((r) => r.json())
			.then((d) => (loaded = d));
	});
	const me = $derived(as === 'coach' ? COACH_ID : PLAYER_ID);
	const compose = $derived(lock === 'payment' ? { allowed: false, reason: 'payment' as const } : lock === 'past_due' ? { allowed: false, reason: 'past_due' as const } : lock === 'ended' ? { allowed: false, reason: 'ended' as const } : { allowed: true, reason: null });
</script>

<svelte:head><title>Messages preview</title></svelte:head>

<AppShell role={as} pathname="/messages">
	{#if loaded}
		{#if view === 'list'}
			<div class="mx-auto max-w-[1100px]">
				<p class="eyebrow">Chat</p>
				<h1 class="h1 mb-3">Messages</h1>
				<ConversationList conversations={[loaded.conversation]} base="/dev/messages-thread" />
			</div>
		{:else}
			<div class="mx-auto max-w-[1100px]">
				{#key as}
					<ChatThread conversation={loaded.conversation} messages={loaded.messages} hasMore={false} {me} {compose} {attach} apiBase="/dev/mock-api" backHref={as === 'coach' ? '/dev/messages?view=list&as=coach' : null} pollMs={1500} />
				{/key}
			</div>
		{/if}
	{/if}
</AppShell>
