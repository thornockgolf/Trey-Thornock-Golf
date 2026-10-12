<script lang="ts">
	import { reveal } from '#lib/actions/reveal';
	import Button from '#lib/components/Button.svelte';
	import { practiceSteps } from '#lib/content/home-lists';
</script>

<section class="section-pad" id="practice-purpose">
	<div class="wrap">
		<div class="section-head" use:reveal>
			<div class="eyebrow">Between Lessons</div>
			<h2>Practice With Purpose.</h2>
			<p>Lessons provide direction. Practice creates change. Every practice session should have a clear purpose, measurable success criteria, and a connection to the golf course.</p>
		</div>
		<ol class="progress-track" use:reveal>
			{#each practiceSteps as step, i}
				<li class="progress-step"><span class="idx">{i + 1}</span><span class="step-label">{step}</span></li>
				{#if i < practiceSteps.length - 1}<li class="progress-arrow" aria-hidden="true">→</li>{/if}
			{/each}
		</ol>
		<div class="cta" use:reveal>
			<Button href="#development" variant="green">Learn About Player Development</Button>
		</div>
	</div>
</section>

<style>
	.progress-track { display: flex; flex-direction: column; gap: 14px; margin: 44px 0 0; padding: 0; list-style: none; }
	@media (min-width: 860px) { .progress-track { flex-direction: row; align-items: stretch; gap: 0; } }
	.progress-step {
		background: var(--card-bg); border: 1px solid var(--card-border); border-radius: 14px;
		padding: 18px; flex: 1; display: flex; align-items: center; gap: 12px; box-shadow: var(--shadow-soft);
	}
	.idx {
		font-family: var(--font-display); font-weight: 800; font-size: 12px; color: var(--white);
		background: var(--green-fill); width: 28px; height: 28px; border-radius: 8px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;
	}
	.step-label { font-family: var(--font-display); font-weight: 600; font-size: 13.5px; color: var(--heading); }
	.progress-arrow { display: none; align-items: center; justify-content: center; color: var(--gold); flex: 0 0 26px; }
	@media (min-width: 860px) { .progress-arrow { display: flex; } }
	.cta { text-align: center; margin-top: 38px; }
</style>
