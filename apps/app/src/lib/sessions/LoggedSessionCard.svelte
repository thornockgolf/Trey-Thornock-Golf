<script lang="ts">
	import type { LoggedSessionDto } from '@ttg/shared';
	import { formatDay } from '#lib/plans/sessions';
	import TagChips from './TagChips.svelte';
	import { videoStateLabel } from './log-form';

	/** A logged (extra) session, read only. `editHref` adds an Edit link (the player's own view). */
	let { session, editHref, class: cls = '' }: { session: LoggedSessionDto; editHref?: string; class?: string } = $props();
</script>

<article class="card surface-raised rounded-container border border-surface-200-800 p-4 md:p-5 {cls}" data-logged={session.id}>
	<div class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
		<p class="eyebrow">{[formatDay(session.date), session.minutes ? `${session.minutes} min` : '', 'Extra'].filter(Boolean).join(' · ')}</p>
		{#if editHref}<a class="anchor min-h-11 text-sm font-medium leading-[2.75rem]" href={editHref}>Edit</a>{/if}
	</div>
	<h3 class="h4 mt-1">{session.workedOn ?? 'Extra practice'}</h3>
	<TagChips tags={session.tags} class="mt-2" />
	{#if session.drills.length > 0}
		<p class="mt-2 text-sm text-surface-700-300"><span class="font-semibold">Drills:</span> {session.drills.map((d) => d.name).join(', ')}</p>
	{/if}
	{#if session.notes}<p class="mt-2 whitespace-pre-line text-surface-700-300">{session.notes}</p>{/if}
	{#if session.video}
		<p class="mt-2 text-sm" data-video-state={session.video.status}>
			{#if session.video.status === 'ready'}
				<a class="anchor font-medium" href="/videos/{session.video.id}">Watch the video</a>
			{:else}
				<span class="font-medium">Video:</span>
			{/if}
			<span class="text-surface-600-400"> {session.video.status === 'ready' ? '' : videoStateLabel(session.video.status)}</span>
		</p>
	{/if}
</article>
