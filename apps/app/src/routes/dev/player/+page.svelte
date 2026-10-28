<script lang="ts">
	import AppShell from '#lib/components/AppShell.svelte';
	import { page } from '$app/state';
	import type { VideoThreadData } from '#lib/chat/chat-client';
	import VideoPage from '#lib/videos/VideoPage.svelte';
	import { CONVERSATION_ID as CONVERSATION, COACH_ID as COACH, PLAYER_ID as PLAYER } from '../messages/ids';

	let { data } = $props();

	// ?chat=player|coach|nocoach|payment|ended shows the video's thread (the mock chat API); no ?chat, no thread.
	const chat = $derived(page.url.searchParams.get('chat'));
	let thread = $state<VideoThreadData | { noCoach: true } | null>(null);
	$effect(() => {
		thread = null;
		if (!chat) return;
		if (chat === 'nocoach') return void (thread = { noCoach: true });
		const as = chat === 'coach' ? 'coach' : 'player';
		void fetch(`/dev/mock-api/conversations/${CONVERSATION}/messages?as=${as}&videoId=${data.video.id}`)
			.then((r) => r.json())
			.then((d) => {
				const compose = chat === 'payment' ? { allowed: false, reason: 'payment' as const } : chat === 'ended' ? { allowed: false, reason: 'ended' as const } : { allowed: true, reason: null };
				thread = { me: as === 'coach' ? COACH : PLAYER, conversation: d.conversation, messages: d.messages, hasMore: d.hasMore, compose };
			});
	});
</script>

<svelte:head><title>Player preview</title></svelte:head>

<!-- dev preview: the same page component as /videos/[id], talking to the mock API, inside the shell -->
<AppShell role={chat === 'coach' ? 'coach' : 'player'} pathname="/videos">
	<VideoPage video={data.video} playback={data.playback} refresh={() => {}} apiBase="/dev/mock-api" commentaryAnalysisId={data.commentary} canAnnotate={chat === 'coach'} {thread} />
</AppShell>
