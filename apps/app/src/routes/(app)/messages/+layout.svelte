<script lang="ts">
	import { page } from '$app/state';
	import ConversationList from '#lib/chat/ConversationList.svelte';

	let { data, children } = $props();
	const activeId = $derived(page.params.id ?? null);
	// the thread (or the "no coach yet" notice) fills a phone screen; the list does otherwise
	const showThread = $derived(activeId !== null || page.url.pathname === '/messages/new');
</script>

<svelte:head><title>Messages | Trey Thornock Golf</title></svelte:head>

<div class="mx-auto grid max-w-[1100px] gap-4 lg:grid-cols-[300px_1fr]">
	<!-- On a phone the list and a thread are separate screens; from lg they sit side by side. -->
	<aside class="{showThread ? 'hidden lg:block' : ''}" aria-label="Conversations">
		<p class="eyebrow">Chat</p>
		<h1 class="h1 mb-3">Messages</h1>
		<ConversationList conversations={data.conversations} {activeId} />
	</aside>
	<div class="{showThread ? '' : 'hidden lg:block'} min-w-0">
		{@render children()}
	</div>
</div>
