<script lang="ts">
	import type { Snippet } from 'svelte';

	type Variant = 'gold' | 'green' | 'outline-dark' | 'outline-light';
	let {
		href,
		variant = 'gold',
		block = false,
		small = false,
		type = 'button',
		class: className = '',
		children,
		...rest
	}: {
		href?: string;
		variant?: Variant;
		block?: boolean;
		small?: boolean;
		type?: 'button' | 'submit';
		class?: string;
		children: Snippet;
		[key: string]: unknown;
	} = $props();

	const external = $derived(!!href && /^https?:\/\//.test(href));
	const cls = $derived(`ttg-btn ${variant} ${block ? 'block' : ''} ${small ? 'small' : ''} ${className}`);
</script>

<!-- Not named "btn": Skeleton owns .btn. Legacy marketing button, ported from index.html. -->
{#if href}
	<a
		{href}
		class={cls}
		target={external ? '_blank' : undefined}
		rel={external ? 'noopener' : undefined}
		{...rest}>{@render children()}</a
	>
{:else}
	<button {type} class={cls} {...rest}>{@render children()}</button>
{/if}

<style>
	.ttg-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		font-family: var(--font-display);
		font-weight: 600;
		font-size: 13.5px;
		line-height: normal;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		text-decoration: none;
		padding: 16px 30px;
		border-radius: 100px;
		border: 2px solid transparent;
		cursor: pointer;
		white-space: nowrap;
		transition:
			transform 0.25s ease,
			box-shadow 0.25s ease,
			background 0.25s ease,
			color 0.25s ease,
			border-color 0.25s ease;
	}
	.small { padding: 13px 22px; font-size: 12.5px; flex-shrink: 0; }
	.block { width: 100%; }
	.gold { background: var(--gold); color: var(--navy); }
	.gold:hover { transform: translateY(-2px); box-shadow: var(--shadow-gold); }
	.green { background: var(--green-fill); color: var(--white); }
	.green:hover { transform: translateY(-2px); box-shadow: 0 14px 28px rgb(11 79 58 / 0.3); background: var(--green-fill-hover); }
	/* navy outline on light, light outline on dark pages (style-guide 16.2) */
	.outline-dark {
		border-color: light-dark(var(--navy), var(--color-surface-300));
		color: light-dark(var(--navy), var(--color-surface-300));
		background: transparent;
	}
	.outline-dark:hover { background: light-dark(var(--navy), var(--color-surface-300)); color: light-dark(var(--white), var(--color-surface-950)); transform: translateY(-2px); }
	.outline-light { border-color: rgb(255 255 255 / 0.55); color: var(--white); background: transparent; }
	.outline-light:hover { background: var(--white); color: var(--navy); transform: translateY(-2px); }
</style>
