<script lang="ts">
		import ChatThread from '#lib/chat/ChatThread.svelte';

	let { data } = $props();
</script>

{#key data.conversation.id}
	<ChatThread
		conversation={data.conversation}
		messages={data.messages}
		hasMore={data.hasMore}
		me={data.me}
		compose={data.compose}
		scope="general"
		backHref={data.conversation.other.role === 'player' ? '/messages' : null}
	/>
{/key}
