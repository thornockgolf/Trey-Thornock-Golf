<script lang="ts">
	import { siteConfig } from '@ttg/shared';
	import { reveal } from '#lib/actions/reveal';
	import Button from '#lib/components/Button.svelte';
	import CheckIcon from './CheckIcon.svelte';
	import PillarCard from './PillarCard.svelte';
	import { juniorPathway, juniorStarts, parentExpect, uskidsIncluded, uskidsPoints } from '#lib/content/junior';

	const mail = (subject: string) => `mailto:${siteConfig.email}?subject=${subject}`;
</script>

<section class="section-pad junior-section" id="junior">
	<div class="wrap">
		<div class="section-head" use:reveal>
			<div class="eyebrow">Junior Golf</div>
			<h2>Junior Golf That Builds Skills, Confidence &amp; a Love for the Game</h2>
			<p>Trey Thornock Golf uses a structured development approach — including the U.S. Kids Golf program — to help junior golfers in Durham, NC build fundamentals, confidence, and a lasting love for the game.</p>
			<div class="junior-hero-actions">
				<Button href="#junior-uskids" variant="gold">Explore Junior Golf</Button>
				<Button href={mail('Junior%20Golf%20Question')} variant="outline-dark">Contact Coach Trey</Button>
			</div>
		</div>

		<div class="junior-banner" use:reveal>
			<img src="/images/img-08.jpg" alt="Group of junior golfers on the putting green" width="1400" height="1050" loading="lazy" />
		</div>

		<!-- U.S. Kids Golf feature -->
		<div class="uskids-feature" id="junior-uskids" use:reveal>
			<div class="uskids-feature-copy">
				<div class="eyebrow">U.S. Kids Golf at Trey Thornock Golf</div>
				<h3>A Development Pathway, Not Just a Lesson</h3>
				<p>Junior golf should be about more than learning how to swing a club. The U.S. Kids Golf program is a core part of Trey’s junior development pathway — built around age-appropriate instruction, fun, confidence, fundamentals, and long-term enjoyment of the game for the whole family.</p>
				<ul class="uskids-feature-points">
					{#each uskidsPoints as point}
						<li><CheckIcon />{point}</li>
					{/each}
				</ul>
			</div>
			<div class="uskids-box">
				<span class="uskids-badge">The Ultimate Youth Development Program</span>
				<div class="uskids-head">
					<h4>U.S. Kids Golf Program</h4>
					<div class="uskids-price">$500</div>
				</div>
				<ul class="uskids-list">
					{#each uskidsIncluded as item}
						<li><CheckIcon size={17} />{item}</li>
					{/each}
				</ul>
				<div class="uskids-cta"><Button href="#pricing" variant="outline-light" block>See Full Pricing</Button></div>
			</div>
		</div>

		<!-- Junior development pathway -->
		<div class="junior-pathway" use:reveal>
			<div class="junior-pathway-head">
				<h3>The Junior Development Pathway</h3>
				<p>Junior golf is a progression, not a collection of random lessons — and the pathway adapts to what each junior wants out of the game.</p>
			</div>
			<div class="junior-pathway-grid">
				{#each juniorPathway as step, i}
					<div class="junior-pathway-step">
						<span class="step-tag">{step.tag}</span>
						<h4>{step.title}</h4>
						<p>{step.text}</p>
					</div>
					{#if i < juniorPathway.length - 1}<div class="junior-pathway-arrow" aria-hidden="true">→</div>{/if}
				{/each}
			</div>
		</div>

		<!-- Every junior has a different starting point -->
		<div class="section-head spaced" use:reveal>
			<div class="eyebrow">Built Around the Junior</div>
			<h3 class="head-h3">Every Junior Has a Different Starting Point</h3>
			<p>Some juniors are brand new to golf, some are building fundamentals, and some are ready to compete. Diagnose first, then prescribe the right coaching path — the same philosophy behind every Trey Thornock Golf lesson.</p>
		</div>
		<div class="grid-3">
			{#each juniorStarts as start}
				<div class="junior-card" use:reveal>
					<div class="junior-card-photo"><img src={start.image.src} alt={start.image.alt} width={start.image.width} height={start.image.height} loading="lazy" /></div>
					<h3>{start.title}</h3>
					<p>{start.text}</p>
				</div>
			{/each}
		</div>

		<!-- What parents can expect -->
		<div class="section-head spaced" use:reveal>
			<div class="eyebrow">For Parents</div>
			<h3 class="head-h3">What Parents Can Expect</h3>
		</div>
		<div class="grid-3 grid-2">
			{#each parentExpect as item}
				<PillarCard title={item.title} text={item.text} compact />
			{/each}
		</div>

		<div class="junior-cta" use:reveal>
			<h3>Ready to Help Your Junior Golfer Take the Next Step?</h3>
			<p>Whether your junior is picking up a club for the first time or working toward their next level, Coach Trey can help identify the right starting point and coaching path.</p>
			<div class="junior-hero-actions center">
				<Button href={mail('Junior%20Golf%20Inquiry')} variant="gold">Start the Conversation</Button>
				<Button href="#pricing" variant="outline-dark">Explore U.S. Kids Golf</Button>
			</div>
		</div>
	</div>
</section>

<style>
	.junior-section { background: var(--alt-bg); }
	.junior-banner { border-radius: var(--radius-lg); overflow: hidden; margin: 0 0 40px; box-shadow: var(--shadow-lift); max-height: 380px; }
	.junior-banner img { width: 100%; height: 100%; object-fit: cover; display: block; max-height: 380px; }
	.junior-hero-actions { display: flex; flex-wrap: wrap; justify-content: center; gap: 14px; margin-top: 26px; }
	.section-head.spaced { margin-top: 70px; }
	/* legacy had no rule here, so these rendered at the UA default h3 size */
	.head-h3 { font-size: 1.17em; }

	.junior-card {
		background: var(--card-bg); border-radius: var(--radius-lg); padding: 0 0 26px; overflow: hidden;
		box-shadow: var(--shadow-soft); border: 1px solid var(--card-border); border-top: 4px solid var(--gold);
		transition: transform 0.3s ease, box-shadow 0.3s ease, opacity 0.7s ease;
	}
	.junior-card:hover { transform: translateY(-6px); box-shadow: var(--shadow-lift); }
	.junior-card-photo { height: 150px; overflow: hidden; }
	.junior-card-photo img { width: 100%; height: 100%; object-fit: cover; transition: transform 0.5s ease; }
	.junior-card:hover .junior-card-photo img { transform: scale(1.06); }
	.junior-card h3 { font-size: 18px; font-weight: 700; margin: 18px 26px 10px; }
	.junior-card p { font-size: 14.5px; color: var(--text-muted); margin-left: 26px; margin-right: 26px; }

	.uskids-feature {
		display: grid; gap: 34px; grid-template-columns: 1fr; align-items: center;
		margin: 0 0 60px; scroll-margin-top: 90px;
	}
	@media (min-width: 860px) { .uskids-feature { grid-template-columns: 1.05fr 0.95fr; } }
	.uskids-feature-copy h3 { font-size: 24px; margin: 10px 0 14px; }
	.uskids-feature-copy p { font-size: 15px; color: var(--text-muted); line-height: 1.7; }
	.uskids-feature-points { list-style: none; margin: 20px 0 0; padding: 0; display: flex; flex-direction: column; gap: 12px; }
	.uskids-feature-points li { display: flex; align-items: flex-start; gap: 10px; font-size: 14.5px; color: var(--text); }
	.uskids-feature-points li :global(svg) { color: var(--icon-stroke); margin-top: 2px; }

	.uskids-box {
		padding: 26px; border-radius: 16px; background: linear-gradient(160deg, var(--green), var(--green-deep));
		color: var(--white); position: relative; overflow: hidden; border: 1px solid rgb(255 255 255 / 0.12);
	}
	.uskids-badge {
		display: inline-block; font-family: var(--font-display); font-weight: 700; font-size: 11px;
		letter-spacing: 0.08em; text-transform: uppercase; color: var(--navy); background: var(--gold-soft);
		padding: 6px 12px; border-radius: 100px; margin-bottom: 14px;
	}
	.uskids-head { display: flex; align-items: baseline; justify-content: space-between; flex-wrap: wrap; gap: 10px; }
	.uskids-head h4 { font-family: var(--font-display); font-size: 18px; font-weight: 700; color: var(--white); margin: 0; }
	.uskids-price { font-family: var(--font-display); font-weight: 800; font-size: 26px; color: var(--gold-soft); }
	.uskids-list { list-style: none; margin: 16px 0 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
	.uskids-list li { display: flex; align-items: flex-start; gap: 10px; font-size: 14px; color: rgb(255 255 255 / 0.9); line-height: 1.5; }
	.uskids-list li :global(svg) { color: var(--gold-soft); margin-top: 1px; }
	.uskids-cta { margin-top: 18px; }

	.junior-pathway { margin-bottom: 60px; }
	.junior-pathway-head { max-width: 640px; margin: 0 auto 34px; text-align: center; }
	.junior-pathway-head h3 { font-size: 24px; }
	.junior-pathway-head p { margin-top: 12px; font-size: 15px; color: var(--text-muted); line-height: 1.7; }
	.junior-pathway-grid { display: flex; flex-direction: column; gap: 18px; align-items: stretch; }
	@media (min-width: 900px) { .junior-pathway-grid { flex-direction: row; } }
	.junior-pathway-step {
		flex: 1; background: var(--card-bg); border-radius: var(--radius-md); padding: 24px 22px;
		box-shadow: var(--shadow-soft); border: 1px solid var(--card-border); border-top: 4px solid var(--green);
	}
	.step-tag {
		display: inline-block; font-family: var(--font-display); font-weight: 700; font-size: 11px;
		letter-spacing: 0.08em; text-transform: uppercase; color: var(--link); background: var(--tint-green);
		padding: 5px 11px; border-radius: 100px; margin-bottom: 12px;
	}
	.junior-pathway-step h4 { font-size: 17px; margin-bottom: 8px; }
	.junior-pathway-step p { font-size: 14px; color: var(--text-muted); line-height: 1.6; }
	.junior-pathway-arrow { display: none; align-items: center; justify-content: center; color: var(--gold); font-size: 20px; flex: 0 0 20px; }
	@media (min-width: 900px) { .junior-pathway-arrow { display: flex; } }

	.junior-cta {
		margin: 70px auto 0; text-align: center; background: var(--card-bg); border-radius: var(--radius-lg);
		padding: 48px 30px; box-shadow: var(--shadow-soft); max-width: 760px; border: 1px solid var(--card-border);
	}
	.junior-cta h3 { font-size: 24px; margin-bottom: 14px; }
	.junior-cta p { font-size: 15px; color: var(--text-muted); line-height: 1.7; }
	@media (prefers-reduced-motion: reduce) { .junior-card, .junior-card-photo img { transition: none; } }
</style>
