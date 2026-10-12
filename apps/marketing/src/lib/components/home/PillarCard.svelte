<script lang="ts">
	import { reveal } from '#lib/actions/reveal';
	import { pillarIcons, type PillarIconName } from '#lib/content/pillar-icons';

	let {
		title,
		text,
		num,
		icon,
		dark = false,
		isNew = false,
		compact = false
	}: {
		title: string;
		text: string;
		num?: string;
		icon?: PillarIconName;
		/** white-on-translucent card for navy bands */
		dark?: boolean;
		isNew?: boolean;
		compact?: boolean;
	} = $props();
</script>

<div class="pillar-card" class:dark class:compact use:reveal>
	{#if isNew}<span class="new-tag">New</span>{/if}
	{#if num}<span class="pillar-num">{num}</span>{/if}
	{#if icon}
		<div class="pillar-icon">
			<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">{@html pillarIcons[icon]}</svg>
		</div>
	{/if}
	<h3>{title}</h3>
	<p>{text}</p>
</div>

<style>
	.pillar-card {
		position: relative;
		background: var(--card-bg);
		border-radius: var(--radius-lg);
		padding: 34px 28px;
		box-shadow: var(--shadow-soft);
		border: 1px solid var(--card-border);
		transition:
			transform 0.3s ease,
			box-shadow 0.3s ease,
			opacity 0.7s ease;
	}
	.pillar-card:hover { transform: translateY(-6px); box-shadow: var(--shadow-lift); }
	.pillar-num {
		font-family: var(--font-display); font-weight: 800; font-size: 13px; color: var(--eyebrow);
		letter-spacing: 0.08em; margin-bottom: 16px; display: block;
	}
	.pillar-icon {
		width: 52px; height: 52px; border-radius: 14px; background: light-dark(var(--color-surface-100), rgb(255 255 255 / 0.08));
		display: flex; align-items: center; justify-content: center; margin-bottom: 18px;
	}
	.pillar-icon svg { width: 26px; height: 26px; stroke: var(--icon-stroke); }
	h3 { font-size: 19px; font-weight: 700; margin-bottom: 10px; }
	p { font-size: 14.5px; color: var(--text-muted); }
	.new-tag {
		position: absolute; top: 18px; right: 18px; font-family: var(--font-display); font-weight: 700;
		font-size: 10.5px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--navy);
		background: var(--gold); padding: 4px 10px; border-radius: 100px;
	}
	.compact { padding: 26px 24px; }
	.compact h3 { font-size: 17px; }

	.dark { background: rgb(255 255 255 / 0.06); border-color: rgb(255 255 255 / 0.15); }
	.dark .pillar-icon { background: rgb(255 255 255 / 0.08); }
	.dark .pillar-icon svg { stroke: var(--gold-soft); }
	.dark h3 { color: var(--white); }
	.dark p { color: rgb(255 255 255 / 0.68); }
</style>
