<script lang="ts">
	import { reveal } from '#lib/actions/reveal';
	import PillarCard from './PillarCard.svelte';
	import { whoICoach } from '#lib/content/pillars';
</script>

<section class="section-pad" id="who-i-coach">
	<div class="wrap">
		<div class="section-head" use:reveal>
			<div class="eyebrow">Who I Coach</div>
			<h2>Coaching for Golfers at Every Level</h2>
			<p>The coaching system is designed around the individual golfer rather than a one-size-fits-all swing method.</p>
		</div>
		<div class="grid-3 grid-2">
			{#each whoICoach as pillar}
				<PillarCard {...pillar} />
			{/each}
		</div>
	</div>
</section>
