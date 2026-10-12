<script lang="ts">
	import { siteConfig } from '@ttg/shared';
	import Button from '#lib/components/Button.svelte';
</script>

<section class="section-pad newsletter-section" id="newsletter">
	<div class="wrap newsletter-wrap">
		<div class="eyebrow on-dark">Stay In The Loop</div>
		<h2>Get Better at Golf</h2>
		<p class="newsletter-lead">Practical golf instruction, practice ideas, player-development strategies, and updates from Trey Thornock Golf.</p>
		<div class="newsletter-cta-card">
			<svg viewBox="0 0 24 24" fill="none" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" class="newsletter-cta-icon" aria-hidden="true"><rect x="2" y="4" width="20" height="16" rx="2" /><path d="M2 7l10 6 10-6" /></svg>
			<p>Takes about 15 seconds — opens Trey’s sign-up form in a new tab.</p>
			<Button href={siteConfig.newsletterUrl} variant="gold">Get Golf Improvement Tips</Button>
		</div>
	</div>
</section>

<style>
	.newsletter-section {
		background: var(--navy);
		border-top: 1px solid rgb(255 255 255 / 0.12);
		border-bottom: 1px solid rgb(255 255 255 / 0.12);
	}
	.newsletter-wrap { max-width: 640px; text-align: center; }
	.newsletter-wrap .eyebrow { justify-content: center; }
	.newsletter-wrap h2 { color: var(--white); font-size: clamp(26px, 4vw, 34px); margin-bottom: 14px; }
	.newsletter-lead { color: rgb(255 255 255 / 0.7); font-size: 15px; line-height: 1.7; margin-bottom: 30px; }
	.newsletter-cta-card {
		background: rgb(255 255 255 / 0.06); border: 1.5px solid rgb(255 255 255 / 0.18); border-radius: var(--radius-lg);
		padding: 38px 30px; max-width: 440px; margin: 0 auto; display: flex; flex-direction: column; align-items: center; gap: 16px;
	}
	.newsletter-cta-icon { width: 38px; height: 38px; stroke: var(--gold-soft); }
	.newsletter-cta-card p { color: rgb(255 255 255 / 0.65); font-size: 13.5px; margin: 0; }
</style>
