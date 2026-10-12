<script lang="ts">
	import { philosophySteps } from '#lib/content/home-lists';
</script>

<div class="philosophy-strip">
	<div class="wrap philosophy-track">
		{#each philosophySteps as step, i}
			<b>{step}</b>{#if i < philosophySteps.length - 1}<span class="arrow" aria-hidden="true">→</span>{/if}
		{/each}
	</div>
</div>

<style>
	.philosophy-strip { background: var(--navy); padding: 26px 0; border-block: 1px solid rgb(255 255 255 / 0.12); }
	.philosophy-track {
		display: flex; align-items: center; justify-content: center; gap: 10px; flex-wrap: wrap;
		font-family: var(--font-display); font-size: 13px; font-weight: 600; letter-spacing: 0.06em;
		text-transform: uppercase; color: rgb(255 255 255 / 0.92);
	}
	b { color: var(--gold-soft); font-weight: 700; }
	.arrow { color: var(--gold); opacity: 0.7; }
</style>
