<script lang="ts">
	import { reveal } from '#lib/actions/reveal';
	import PillarCard from './PillarCard.svelte';
	import { results } from '#lib/content/pillars';
</script>

<section class="section-pad" id="results">
	<div class="wrap">
		<div class="section-head" use:reveal>
			<div class="eyebrow">Proven Results</div>
			<h2>Proven Results. Real Golfers.</h2>
			<p>Trey Thornock Golf is built around measurable player development — not just collecting swing tips. Coaching is designed to help golfers understand their game, practice with purpose, and ultimately perform better on the course.</p>
		</div>
		<div class="grid-3 grid-2">
			{#each results as pillar}
				<PillarCard {...pillar} />
			{/each}
		</div>
	</div>
</section>
