<script lang="ts">
	import type { Snippet } from 'svelte';
	import { siteConfig } from '@ttg/shared';

	/** Centered chrome shared by every signed-out screen (sign-in, sign-up, no access). Style guide: "Auth screens". */
	let { heading, intro, children }: { heading: string; intro?: string; children: Snippet } = $props();
</script>

<a href="#main" class="skip">Skip to content</a>
<div class="flex min-h-dvh flex-col items-center bg-surface-100-900 px-4 py-8 sm:py-12">
	<a href="/" class="flex items-center gap-2.5" aria-label="Trey Thornock Golf home">
		<span class="flex size-12 items-center justify-center overflow-hidden rounded-[10px] bg-white">
			<img src="/images/img-01.png" alt="" width="48" height="48" class="size-full object-contain" />
		</span>
		<span class="font-display text-base leading-tight font-bold tracking-wide text-secondary-500 dark:text-secondary-100">
			TREY THORNOCK
			<span class="block font-body text-[11px] font-medium tracking-[0.14em] text-tertiary-800 uppercase dark:text-tertiary-400">Golf Coaching</span>
		</span>
	</a>
	<main id="main" class="mt-8 flex w-full max-w-md flex-1 flex-col items-center gap-6 sm:flex-initial">
		<div class="text-center">
			<h1 class="h2">{heading}</h1>
			{#if intro}<p class="mt-2 text-surface-600-400">{intro}</p>{/if}
		</div>
		{@render children()}
	</main>
	<p class="mt-8 max-w-md text-center text-sm text-surface-600-400">
		Need help? Email <a class="anchor inline-flex min-h-6 items-center font-medium" href="mailto:{siteConfig.email}">{siteConfig.email}</a>
		or call <a class="anchor inline-flex min-h-6 items-center font-medium" href={siteConfig.phone.tel}>{siteConfig.phone.display}</a>.
	</p>
</div>

<style>
	.skip { position: absolute; left: -9999px; top: 0; z-index: 100; background: var(--color-secondary-500); color: #fff; padding: 10px 16px; border-radius: 0 0 8px 0; }
	.skip:focus { left: 0; }
</style>
