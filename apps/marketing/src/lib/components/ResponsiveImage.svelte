<script lang="ts">
	import manifest from '#lib/content/image-manifest.json';

	/**
	 * A `<picture>` with AVIF and WebP `srcset`s built from the variants `bun run images` made. The original JPEG
	 * or PNG is the fallback `src`. `width`/`height` default to the source size (they only set the aspect ratio).
	 * Lazy by default; pass `eager` for anything visible on first paint, `priority` for the LCP image.
	 */
	type Props = {
		/** Source name without extension, e.g. `img-04`. */
		name: string;
		alt: string;
		/** The `sizes` attribute: how wide the image is laid out at each viewport. */
		sizes: string;
		eager?: boolean;
		/** The likely largest-contentful-paint image: also `fetchpriority="high"`. Implies eager. */
		priority?: boolean;
		class?: string;
		width?: number;
		height?: number;
	};
	let { name, alt, sizes, eager = false, priority = false, class: className, width, height }: Props = $props();

	const isEager = $derived(eager || priority);
	const entry = $derived((manifest as Record<string, { src: string; width: number; height: number; widths: number[] }>)[name]);
	const set = (ext: 'avif' | 'webp') => (entry?.widths ?? []).map((w) => `/images/${name}-${w}.${ext} ${w}w`).join(', ');
</script>

{#if entry}
	<picture>
		<source type="image/avif" srcset={set('avif')} {sizes} />
		<source type="image/webp" srcset={set('webp')} {sizes} />
		<img
			class={className}
			src={entry.src}
			{alt}
			width={width ?? entry.width}
			height={height ?? entry.height}
			loading={isEager ? 'eager' : 'lazy'}
			decoding={isEager ? 'sync' : 'async'}
			fetchpriority={priority ? 'high' : 'auto'}
		/>
	</picture>
{/if}

<style>
	/* The picture adds no box, so CSS written for the img (height: 100%, object-fit) still sees its parent. */
	picture {
		display: contents;
	}
</style>
