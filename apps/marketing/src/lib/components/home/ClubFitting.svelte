<script lang="ts">
	import { siteConfig } from '@ttg/shared';
	import { reveal } from '#lib/actions/reveal';
	import Button from '#lib/components/Button.svelte';
	import { clubFittingPoints } from '#lib/content/home-lists';
</script>

<section class="section-pad" id="club-fitting">
	<div class="wrap">
		<div class="about-grid">
			<div class="about-copy" use:reveal>
				<div class="eyebrow">Equipment</div>
				<h2>Club Fitting &amp; Equipment Optimization</h2>
				<p class="lead">The right equipment should support the golfer — not hide problems or create new ones.</p>
				<ul class="credential-list">
					{#each clubFittingPoints as point}<li>{point}</li>{/each}
				</ul>
				<div class="cta">
					<Button href="mailto:{siteConfig.email}?subject=Club%20Fitting%20Inquiry" variant="green">Explore Club Fitting</Button>
				</div>
			</div>
			<div class="about-photo" use:reveal>
				<img src="/images/img-06.jpg" alt="TrackMan equipment testing and club fitting technology" width="800" height="600" loading="lazy" />
			</div>
		</div>
	</div>
</section>

<style>
	.about-grid { display: grid; gap: 44px; align-items: center; }
	@media (min-width: 900px) { .about-grid { grid-template-columns: 0.85fr 1.15fr; } }
	h2 { font-size: clamp(26px, 4vw, 36px); margin-bottom: 16px; }
	.lead { font-size: 15px; color: var(--text-muted); line-height: 1.75; margin-bottom: 20px; }
	.credential-list { list-style: none; margin: 10px 0 0; padding: 0; display: flex; flex-direction: column; gap: 9px; }
	.credential-list li { font-size: 14px; color: var(--text-muted); display: flex; align-items: flex-start; gap: 9px; line-height: 1.55; }
	.credential-list li::before { content: ''; width: 6px; height: 6px; border-radius: 50%; background: var(--gold); margin-top: 7px; flex-shrink: 0; }
	.cta { margin-top: 26px; }
	.about-photo { aspect-ratio: 4 / 5; border-radius: var(--radius-lg); position: relative; box-shadow: var(--shadow-lift); }
	.about-photo img {
		width: 100%; height: 100%; object-fit: cover; object-position: center 20%; display: block;
		border-radius: var(--radius-lg); position: relative; z-index: 1;
	}
</style>
