<script lang="ts">
	import { siteConfig } from '@ttg/shared';
	import { reveal } from '#lib/actions/reveal';
	import Button from '#lib/components/Button.svelte';
</script>

<section class="section-pad" id="contact">
	<div class="wrap">
		<div class="section-head" use:reveal>
			<div class="eyebrow">Contact</div>
			<h2>Trey Thornock Golf</h2>
			<p>Golf lessons, junior golf, and player development — coaching out of Durham, NC and Douglas, WY.</p>
		</div>
		<div class="contact-grid" use:reveal>
			<div class="contact-card">
				<span class="icon-badge"><svg viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3.1-8.7A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .3 2 .7 3a2 2 0 0 1-.5 2.1L8 10.1a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c1 .4 2 .6 3 .7a2 2 0 0 1 1.6 2z" /></svg></span>
				<h4>Phone</h4>
				<a href={siteConfig.phone.tel}>{siteConfig.phone.display}</a>
			</div>
			<div class="contact-card">
				<span class="icon-badge"><svg viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="4" width="20" height="16" rx="2" /><path d="M2 7l10 6 10-6" /></svg></span>
				<h4>Email</h4>
				<a href="mailto:{siteConfig.email}">{siteConfig.email}</a>
			</div>
		</div>
		<div class="contact-book" use:reveal>
			<Button href={siteConfig.bookingUrl} variant="green">Book a Lesson</Button>
		</div>
	</div>
</section>

<style>
	.contact-grid {
		display: grid; gap: 24px; grid-template-columns: 1fr; margin: 10px auto 0; max-width: 480px;
	}
	@media (min-width: 560px) { .contact-grid { grid-template-columns: repeat(2, 1fr); } }
	.contact-card {
		background: var(--card-bg); border: 1px solid var(--line); border-radius: var(--radius-md); padding: 26px;
		display: flex; flex-direction: column; gap: 10px; align-items: flex-start; min-width: 0;
	}
	.icon-badge {
		width: 44px; height: 44px; border-radius: 12px; background: var(--alt-bg); display: flex; align-items: center; justify-content: center;
	}
	.icon-badge svg { width: 20px; height: 20px; stroke: var(--icon-stroke); }
	.contact-card h4 { font-size: 14px; font-weight: 700; color: var(--heading); font-family: var(--font-display); }
	.contact-card a { font-size: 14.5px; color: var(--text-muted); overflow-wrap: anywhere; }
	.contact-card a:hover { color: var(--link); }
	.contact-book { text-align: center; margin-top: 36px; }
</style>
