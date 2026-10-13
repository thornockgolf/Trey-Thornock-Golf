<script lang="ts">
	import { page } from '$app/state';
	import ChatThread from '#lib/chat/ChatThread.svelte';

	let { data } = $props();

	// `?video=<id>&ms=3200`: the first message points at that moment of that video.
	const attach = $derived.by(() => {
		const video = page.url.searchParams.get('video');
		const ms = page.url.searchParams.get('ms');
		if (!video) return null;
		return { videoId: video, videoMs: ms !== null && /^\d{1,9}$/.test(ms) ? Number(ms) : null };
	});
</script>

{#key data.conversation.id}
	<ChatThread
		conversation={data.conversation}
		messages={data.messages}
		hasMore={data.hasMore}
		me={data.me}
		compose={data.compose}
		{attach}
		backHref={data.conversation.other.role === 'player' ? '/messages' : null}
	/>
{/key}
