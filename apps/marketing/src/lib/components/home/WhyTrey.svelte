<script lang="ts">
	import { reveal } from '#lib/actions/reveal';
	import PillarCard from './PillarCard.svelte';
	import { whyTrey } from '#lib/content/pillars';
</script>

<section class="section-pad why-trey" id="why-trey">
	<div class="wrap">
		<div class="section-head on-dark" use:reveal>
			<div class="eyebrow on-dark">Why Trey?</div>
			<h2>What Sets Trey Thornock Golf Apart</h2>
			<p>A combination of credentials, technology, and a coaching philosophy most golfers won’t find together anywhere else in the area.</p>
		</div>
		<div class="grid-3">
			{#each whyTrey as pillar}
				<PillarCard {...pillar} dark />
			{/each}
		</div>
	</div>
</section>

<style>
	.why-trey { background: var(--navy); border-block: 1px solid rgb(255 255 255 / 0.12); }
</style>
