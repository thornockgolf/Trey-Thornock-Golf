<script lang="ts">
	import { SESSION_TAG_LABELS, type SessionTag } from '@ttg/shared';

	/** What a session contains, as small read-only chips (Mechanical technique, Skill, Situational practice). */
	let { tags, class: cls = '' }: { tags: readonly SessionTag[] | undefined; class?: string } = $props();

	const PRESET: Record<SessionTag, string> = {
		mechanical: 'preset-tonal-primary',
		skill: 'preset-tonal-secondary',
		situational: 'preset-tonal-tertiary'
	};
</script>

{#if tags && tags.length > 0}
	<ul class="flex flex-wrap gap-1.5 {cls}" aria-label="Session contains" data-tags>
		{#each tags as tag (tag)}
			<li class="badge rounded-pill text-xs font-semibold {PRESET[tag]}" data-tag={tag}>{SESSION_TAG_LABELS[tag]}</li>
		{/each}
	</ul>
{/if}
