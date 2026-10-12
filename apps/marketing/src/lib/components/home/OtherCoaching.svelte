<script lang="ts">
	import { siteConfig } from '@ttg/shared';
	import { reveal } from '#lib/actions/reveal';
	import Button from '#lib/components/Button.svelte';
	import { onlineTiers } from '#lib/content/pricing';

	const mailto = (subject: string) => `mailto:${siteConfig.email}?subject=${encodeURIComponent(subject)}`;
</script>

<section class="section-pad other-section" id="other-coaching">
	<div class="wrap">
		<div class="section-head on-dark" use:reveal>
			<div class="eyebrow on-dark">Beyond Dick’s House of Sport</div>
			<h2>Other Coaching Options</h2>
			<p>Separate offerings outside of Dick’s House of Sport pricing.</p>
		</div>

		<h3 class="online-coaching-label" use:reveal>Online Coaching</h3>
		<div class="online-grid" use:reveal>
			{#each onlineTiers as tier (tier.title)}
				<div class="online-tier" class:featured={tier.featured}>
					<span class="online-tier-tag" class:gold={tier.featured}>{tier.tag}</span>
					<h3>{tier.title}</h3>
					<div class="online-tier-price">{tier.price}{#if tier.priceSuffix}<span>{tier.priceSuffix}</span>{/if}</div>
					<p class="online-tier-desc">{tier.description}</p>
					<ul class="online-tier-list">
						{#each tier.features as feature (feature)}
							<li>{feature}</li>
						{/each}
					</ul>
					<div class="tier-cta">
						<Button href={mailto(tier.subject)} variant={tier.featured ? 'gold' : 'outline-light'} block>Get Started</Button>
					</div>
					<p class="tier-email-fallback">Or email <a href={mailto(tier.subject)}>{siteConfig.email}</a></p>
				</div>
			{/each}
		</div>

		<div class="private-lessons-note" use:reveal>
			<h3>Private Lessons</h3>
			<p>Private lessons outside of Dick’s House of Sport, including in Douglas, Wyoming, are available upon request.</p>
		</div>

		<div class="other-contact-cta" use:reveal>
			<p>For online coaching or private lessons, reach out directly:</p>
			<div class="other-contact-buttons">
				<Button href={mailto('Coaching Inquiry')} variant="gold">Email {siteConfig.email}</Button>
				<Button href={siteConfig.phone.tel} variant="outline-light">Call {siteConfig.phone.display}</Button>
			</div>
		</div>
	</div>
</section>

<style>
	.other-section {
		background: var(--navy);
		border-top: 1px solid rgb(255 255 255 / 0.12);
		border-bottom: 1px solid rgb(255 255 255 / 0.12);
	}
	.online-grid { display: grid; gap: 24px; grid-template-columns: 1fr; max-width: 920px; margin: 0 auto; }
	.online-coaching-label {
		text-align: center; font-family: var(--font-display); font-weight: 700; font-size: 13px; letter-spacing: 0.1em;
		text-transform: uppercase; color: var(--gold-soft); margin: 0 0 22px;
	}
	@media (min-width: 760px) { .online-grid { grid-template-columns: 1fr 1fr; } }
	.online-tier {
		background: rgb(255 255 255 / 0.05); border: 1.5px solid rgb(255 255 255 / 0.18); border-radius: var(--radius-lg);
		padding: 30px 26px; display: flex; flex-direction: column;
	}
	.online-tier-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; flex: 1; }
	.online-tier.featured { background: rgb(212 160 23 / 0.08); border-color: rgb(212 160 23 / 0.5); }
	.online-tier-tag {
		align-self: flex-start; font-family: var(--font-display); font-weight: 700; font-size: 10.5px; letter-spacing: 0.08em;
		text-transform: uppercase; color: rgb(255 255 255 / 0.7); background: rgb(255 255 255 / 0.1);
		padding: 5px 12px; border-radius: 100px; margin-bottom: 14px;
	}
	.online-tier-tag.gold { background: var(--gold); color: var(--navy); }
	.online-tier h3 { color: var(--white); font-size: 19px; font-weight: 700; line-height: 1.3; margin-bottom: 8px; }
	.online-tier-price { font-family: var(--font-display); font-weight: 800; font-size: 30px; color: var(--gold-soft); margin-bottom: 12px; }
	.online-tier-price span { font-size: 14px; font-weight: 600; color: rgb(255 255 255 / 0.6); }
	.online-tier-desc { font-size: 14px; color: rgb(255 255 255 / 0.68); line-height: 1.6; margin-bottom: 18px; }
	.online-tier-list li { font-size: 13.5px; color: rgb(255 255 255 / 0.85); padding-left: 20px; position: relative; line-height: 1.5; }
	.online-tier-list li::before { content: ''; position: absolute; left: 0; top: 7px; width: 6px; height: 6px; border-radius: 50%; background: var(--gold-soft); }
	.tier-cta { margin-top: 20px; display: flex; }
	.tier-cta :global(.ttg-btn) { flex: 1; }
	.tier-email-fallback { text-align: center; font-size: 12.5px; color: rgb(255 255 255 / 0.55); margin: 10px 0 0; }
	.tier-email-fallback a { color: var(--gold-soft); text-decoration: underline; }
	.private-lessons-note {
		max-width: 640px; margin: 40px auto 0; text-align: center; padding-top: 36px; border-top: 1px solid rgb(255 255 255 / 0.12);
	}
	.private-lessons-note h3 { color: var(--white); font-size: 19px; font-weight: 700; margin-bottom: 10px; }
	.private-lessons-note p { color: rgb(255 255 255 / 0.7); font-size: 14.5px; line-height: 1.7; margin-bottom: 0; }
	.other-contact-cta { max-width: 640px; margin: 28px auto 0; text-align: center; }
	.other-contact-cta p { color: rgb(255 255 255 / 0.7); font-size: 14px; margin-bottom: 18px; }
	.other-contact-buttons { display: flex; flex-wrap: wrap; gap: 14px; justify-content: center; }
</style>
