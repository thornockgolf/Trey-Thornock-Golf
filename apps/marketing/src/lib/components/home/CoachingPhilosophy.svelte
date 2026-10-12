<script lang="ts">
	import { reveal } from '#lib/actions/reveal';
	import PillarCard from './PillarCard.svelte';
	import { coachingPillars } from '#lib/content/pillars';
</script>

<section class="section-pad" id="coaching-built-around-you">
	<div class="wrap">
		<div class="section-head" use:reveal>
			<div class="eyebrow">Our Approach</div>
			<h2>Coaching Built Around You</h2>
			<p>Every golfer is different. Trey Thornock Golf uses personalized coaching to identify the biggest opportunity for improvement, build the right skills, and create a clear path forward.</p>
		</div>
		<div class="grid-3">
			{#each coachingPillars as pillar}
				<PillarCard {...pillar} />
			{/each}
		</div>
	</div>
</section>
