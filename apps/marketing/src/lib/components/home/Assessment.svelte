<script lang="ts">
	import { siteConfig } from '@ttg/shared';
	import { reveal } from '#lib/actions/reveal';
	import Button from '#lib/components/Button.svelte';
	import CheckIcon from './CheckIcon.svelte';
	import TagPills from './TagPills.svelte';
	import { assessmentTags, assessmentGives } from '#lib/content/home-lists';
</script>

<section class="section-pad assessment-section" id="assessment">
	<div class="wrap">
		<div class="assessment-grid">
			<div class="assessment-copy" use:reveal>
				<div class="eyebrow">Start Here</div>
				<h2>Start With Your Golf Performance Assessment</h2>
				<p class="assessment-lead">Before making a major change to your swing, we first need to understand your game. The Golf Performance Assessment evaluates the golfer as a whole and identifies the biggest opportunities for improvement.</p>
				<TagPills tags={assessmentTags} />
				<div class="cta"><Button href={siteConfig.bookingUrl} variant="gold">Start Your Assessment</Button></div>
			</div>
			<div class="assessment-gives" use:reveal>
				<h3>Your Assessment Gives You:</h3>
				<ul class="assessment-list">
					{#each assessmentGives as item}
						<li><CheckIcon size={19} />{item}</li>
					{/each}
				</ul>
			</div>
		</div>
	</div>
</section>

<style>
	.assessment-section { background: linear-gradient(180deg, var(--page-bg), var(--alt-bg)); }
	.assessment-grid { display: grid; gap: 36px; align-items: start; }
	@media (min-width: 900px) { .assessment-grid { grid-template-columns: 1.2fr 0.8fr; gap: 50px; } }
	/* legacy had no h2 rule here (UA default size) */
	h2 { font-size: 1.5em; }
	.assessment-lead { font-size: 16.5px; color: var(--text-muted); line-height: 1.75; margin-top: 16px; max-width: 560px; }
	.cta { margin-top: 30px; }
	.assessment-gives {
		background: var(--navy); border-radius: var(--radius-lg); padding: 34px 30px; box-shadow: var(--shadow-lift);
		border: 1px solid rgb(255 255 255 / 0.12);
	}
	.assessment-gives h3 { color: var(--white); font-size: 17px; font-weight: 700; margin-bottom: 20px; }
	.assessment-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 16px; }
	.assessment-list li { display: flex; align-items: flex-start; gap: 12px; font-size: 14.5px; color: rgb(255 255 255 / 0.88); line-height: 1.5; }
	.assessment-list li :global(svg) { color: var(--gold-soft); margin-top: 1px; }
</style>
