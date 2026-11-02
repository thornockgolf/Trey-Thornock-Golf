<script lang="ts">
	import type { PlanSessionDto } from '@ttg/shared';
	import { toaster } from '#lib/toaster';
	import TagChips from '#lib/sessions/TagChips.svelte';
	import DrillCard from './DrillCard.svelte';
	import DrillVideo from './DrillVideo.svelte';
	import FavoriteButton from './FavoriteButton.svelte';
	import type { FavoritesStore } from './favorites.svelte';
	import { formatDay, isFinished, progress, withItemCompleted } from './sessions';

	/** `onChange` gets the new session after each check-off (optimistic first, then the server's copy; the old one on failure). */
	let {
		session,
		missed = false,
		apiBase = '/api',
		favorites,
		onChange
	}: {
		session: PlanSessionDto;
		missed?: boolean;
		/** `/api`, or a dev mock. */
		apiBase?: string;
		/** With it, the session and each drill get a star. Without it (e.g. the single-session page) there are none. */
		favorites?: FavoritesStore;
		onChange: (next: PlanSessionDto) => void;
	} = $props();

	const p = $derived(progress(session));

	const check = async (itemId: string, completed: boolean) => {
		const before = session;
		onChange(withItemCompleted(session, itemId, completed));
		try {
			const res = await fetch(`${apiBase}/sessions/${session.id}/items/${itemId}`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ completed })
			});
			if (!res.ok) throw new Error();
			onChange((await res.json()) as PlanSessionDto);
		} catch {
			onChange(before);
			toaster.error({ title: 'Could not save that. Check your connection and try again.' });
		}
	};
</script>

<article id="session-{session.id}" tabindex="-1" class="card surface-raised border border-surface-200-800 rounded-container p-5 scroll-mt-20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500" aria-labelledby="s-{session.id}" data-session-card>
	<div class="mb-3 flex flex-wrap items-baseline justify-between gap-2">
		<div>
			<p class="eyebrow">{formatDay(session.scheduledOn)}{#if session.durationMin} · {session.durationMin} min{/if}</p>
			<h3 id="s-{session.id}" class="h3">{session.title ?? 'Practice session'}</h3>
			{#if session.planTitle}<p class="text-sm text-surface-600-400">{session.planTitle}</p>{/if}
			<TagChips tags={session.tags} class="mt-2" />
		</div>
		<div class="flex items-center gap-1">
			<p class="text-sm font-semibold" class:text-success-600-400={isFinished(session)} aria-live="polite">
				{#if isFinished(session)}Done{:else}{p.done} of {p.total} drills{/if}
			</p>
			{#if favorites}<FavoriteButton pressed={favorites.has('session', session.id)} label={session.title ?? 'Practice session'} onToggle={() => favorites.toggle('session', session.id)} />{/if}
		</div>
	</div>
	{#if missed && !isFinished(session)}
		<p class="mb-3 text-sm text-surface-600-400">This one was not finished. You can still check drills off.</p>
	{/if}

	<ul class="flex flex-col gap-2">
		{#each session.items as item (item.id)}
			<li class="flex items-start gap-3">
				<input
					id="item-{item.id}"
					class="checkbox mt-3 size-6"
					type="checkbox"
					checked={item.completedAt !== null}
					onchange={(e) => check(item.id, e.currentTarget.checked)}
					aria-label="Mark {item.name} done"
				/>
				<div class="min-w-0 flex-1">
					<DrillCard
						drillId={item.drillId}
						name={item.name}
						minutes={item.minutes}
						{apiBase}
						favorite={favorites?.has('drill', item.drillId)}
						onFavorite={favorites ? () => favorites.toggle('drill', item.drillId) : undefined}
					>
						<DrillVideo {session} itemId={item.id} video={item.video} {apiBase} {onChange} />
					</DrillCard>
				</div>
			</li>
		{/each}
	</ul>
</article>
