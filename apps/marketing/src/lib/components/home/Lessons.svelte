<script lang="ts">
	import ResponsiveImage from '#lib/components/ResponsiveImage.svelte';
	import { reveal } from '#lib/actions/reveal';
	import Button from '#lib/components/Button.svelte';
	import { programs } from '#lib/content/programs';
</script>

<section class="section-pad lessons" id="lessons">
	<div class="wrap">
		<div class="section-head" use:reveal>
			<div class="eyebrow">What We Offer</div>
			<h2>Coaching Programs</h2>
			<p>Three focused ways to work with Trey — each connected by the same development philosophy.</p>
		</div>
		<div class="grid-3">
			{#each programs as program}
				<div class="service-card" id={program.id} use:reveal>
					<div class="service-top"><ResponsiveImage name={program.image.name} alt={program.image.alt} sizes="(min-width: 900px) 33vw, 100vw" /></div>
					<div class="service-body">
						<h3>{program.title}</h3>
						<p>{program.blurb}</p>
						<ul class="service-list">
							{#each program.points as point}<li>{point}</li>{/each}
						</ul>
						<div class="service-cta"><Button href={program.cta.href} variant="outline-dark">{program.cta.label}</Button></div>
					</div>
				</div>
			{/each}
		</div>
	</div>
</section>

<style>
	.lessons { background: var(--alt-bg); }
	.service-card {
		background: var(--card-bg); border-radius: var(--radius-lg); overflow: hidden;
		box-shadow: var(--shadow-soft); border: 1px solid var(--card-border); display: flex; flex-direction: column;
		transition: transform 0.3s ease, box-shadow 0.3s ease, opacity 0.7s ease;
	}
	.service-card:hover { transform: translateY(-6px); box-shadow: var(--shadow-lift); }
	.service-top { height: 170px; position: relative; overflow: hidden; background: var(--alt-bg); }
	.service-top :global(img) { width: 100%; height: 100%; object-fit: cover; transition: transform 0.5s ease; }
	.service-card:hover .service-top :global(img) { transform: scale(1.05); }
	.service-top::after {
		content: ''; position: absolute; inset: 0;
		background: linear-gradient(180deg, rgb(11 43 92 / 0) 45%, rgb(8 20 15 / 0.55) 100%);
	}
	.service-body { padding: 26px 26px 28px; display: flex; flex-direction: column; gap: 14px; flex: 1; }
	.service-body h3 { font-size: 20px; font-weight: 700; }
	.service-body p { font-size: 14.5px; color: var(--text-muted); }
	.service-list { list-style: none; margin: 4px 0 0; padding: 0; display: flex; flex-direction: column; gap: 9px; }
	.service-list li { font-size: 13.5px; color: var(--text-muted); display: flex; align-items: flex-start; gap: 9px; }
	.service-list li::before { content: ''; width: 6px; height: 6px; border-radius: 50%; background: var(--gold); margin-top: 6px; flex-shrink: 0; }
	.service-cta { margin-top: auto; align-self: flex-start; }
	@media (prefers-reduced-motion: reduce) { .service-card, .service-top :global(img) { transition: none; } }
</style>
