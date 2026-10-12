<script lang="ts">
	import CircleAlert from '@lucide/svelte/icons/circle-alert';
	import CircleCheck from '@lucide/svelte/icons/circle-check';
	import Clock from '@lucide/svelte/icons/clock';
	import Film from '@lucide/svelte/icons/film';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import Upload from '@lucide/svelte/icons/upload';
	import type { VideoDto } from '@ttg/shared';
	import { displayTitle, formatDate, formatDuration, libraryVideos, statusChip, type ChipTone } from './library';

	let { videos, uploadHref = '/videos/new', label = 'Your videos' }: { videos: readonly VideoDto[]; uploadHref?: string; label?: string } = $props();

	const shown = $derived(libraryVideos(videos));

	const tone: Record<ChipTone, string> = {
		success: 'preset-tonal-success',
		warning: 'preset-tonal-warning',
		error: 'preset-tonal-error',
		surface: 'preset-tonal-surface'
	};
</script>

{#if shown.length === 0}
	<div class="mx-auto flex max-w-[480px] flex-col items-center gap-4 rounded-container border border-dashed border-surface-300-700 bg-surface-100-900 px-6 py-12 text-center">
		<span class="flex size-14 items-center justify-center rounded-[14px] surface-raised text-primary-500 dark:text-primary-200">
			<Film class="size-7" strokeWidth={1.8} aria-hidden="true" />
		</span>
		<div>
			<p class="font-display text-lg font-bold text-secondary-500 dark:text-secondary-100">No videos yet</p>
			<p class="mt-1 text-surface-600-400">Upload a swing and Trey can review it. A phone video from behind or face on works best.</p>
		</div>
		<a href={uploadHref} class="btn min-h-12 preset-filled-tertiary-500">
			<Upload class="size-5" strokeWidth={1.8} aria-hidden="true" /> Upload a swing
		</a>
	</div>
{:else}
	<ul class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label={label}>
		{#each shown as video (video.id)}
			{@const chip = statusChip(video.status)}
			{@const duration = formatDuration(video.durationMs)}
			<li class="card surface-raised relative flex flex-col overflow-hidden border border-surface-200-800 rounded-container">
				<div class="relative aspect-video bg-primary-950">
					{#if video.posterUrl}
						<img src={video.posterUrl} alt="" loading="lazy" class="size-full object-cover" />
					{:else}
						<div class="flex size-full items-center justify-center text-white/70">
							{#if video.status === 'processing' || video.status === 'uploaded'}
								<LoaderCircle class="size-8 motion-safe:animate-spin" strokeWidth={1.8} aria-hidden="true" />
							{:else}
								<Film class="size-8" strokeWidth={1.8} aria-hidden="true" />
							{/if}
						</div>
					{/if}
					{#if duration}
						<span class="absolute right-2 bottom-2 rounded-base bg-black/75 px-1.5 py-0.5 font-display text-xs font-semibold text-white tabular-nums">{duration}</span>
					{/if}
				</div>
				<div class="flex flex-1 flex-col gap-2 p-4">
					<div class="flex items-start justify-between gap-3">
						<h3 class="min-w-0 font-display font-bold text-secondary-500 dark:text-secondary-100 break-words">
							{#if video.status === 'ready'}
								<!-- the whole card is the link target -->
								<a href="/videos/{video.id}" class="after:absolute after:inset-0 after:content-[''] focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-tertiary-500">{displayTitle(video)}</a>
							{:else}
								{displayTitle(video)}
							{/if}
						</h3>
						<span class="badge shrink-0 rounded-pill text-xs font-semibold {tone[chip.tone]}">
							{#if chip.tone === 'success'}<CircleCheck class="size-3.5" strokeWidth={2} aria-hidden="true" />
							{:else if chip.tone === 'error'}<CircleAlert class="size-3.5" strokeWidth={2} aria-hidden="true" />
							{:else}<Clock class="size-3.5" strokeWidth={2} aria-hidden="true" />{/if}
							{chip.label}
						</span>
					</div>
					<p class="text-sm text-surface-600-400">
						<time datetime={video.createdAt}>{formatDate(video.createdAt)}</time>{#if duration}<span aria-hidden="true">{' · '}</span><span class="sr-only">{', length '}</span>{duration}{/if}
					</p>
					{#if chip.note}
						<p class="text-sm {video.status === 'failed' ? 'text-error-700-300' : 'text-surface-600-400'}">
							{chip.note}
							{#if video.status === 'failed'}<a href={uploadHref} class="anchor font-medium">Upload again</a>{/if}
						</p>
					{/if}
				</div>
			</li>
		{/each}
	</ul>
{/if}
