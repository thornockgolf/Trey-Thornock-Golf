<script lang="ts">
	import { reveal } from '#lib/actions/reveal';
	import { testimonials } from '#lib/content/testimonials';
</script>

<section class="section-pad" id="testimonials">
	<div class="wrap">
		<div class="section-head" use:reveal>
			<div class="eyebrow">Testimonials</div>
			<h2>What Golfers Are Saying</h2>
			<p>Real feedback from the golfers Trey has coached.</p>
		</div>
		<div class="grid-3">
			{#each testimonials as t (t.name)}
				<figure class="testimonial-card" use:reveal>
					<span class="quote-mark" aria-hidden="true">&ldquo;</span>
					<blockquote class="quote">{t.quote}</blockquote>
					<figcaption class="testimonial-who">
						<span class="testimonial-avatar">
							<svg viewBox="0 0 24 24" fill="none" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="3.2" /><path d="M5 20c0-3.6 3-6.5 7-6.5s7 2.9 7 6.5" /></svg>
						</span>
						<div><strong>{t.name}</strong><span>{t.role}</span></div>
					</figcaption>
				</figure>
			{/each}
		</div>
	</div>
</section>

<style>
	.testimonial-card {
		margin: 0; background: var(--card-bg); border-radius: var(--radius-lg); padding: 30px 26px;
		box-shadow: var(--shadow-soft); border: 1px solid var(--card-border); display: flex; flex-direction: column; gap: 18px;
	}
	.quote-mark { font-family: var(--font-display); font-size: 44px; color: var(--gold); line-height: 1; opacity: 0.5; }
	.quote { margin: 0; font-size: 15.5px; color: var(--text-muted); font-style: italic; line-height: 1.7; }
	.testimonial-who { display: flex; align-items: center; gap: 12px; margin-top: auto; }
	.testimonial-avatar {
		width: 42px; height: 42px; border-radius: 50%; background: var(--alt-bg); border: 1px solid var(--line);
		display: flex; align-items: center; justify-content: center; flex-shrink: 0;
	}
	.testimonial-avatar svg { width: 18px; height: 18px; stroke: var(--text-muted); }
	.testimonial-who strong { display: block; font-family: var(--font-display); font-size: 13.5px; color: var(--heading); }
	.testimonial-who span:not(.testimonial-avatar) { font-size: 12px; color: var(--text-muted); }
</style>
