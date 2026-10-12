<script lang="ts">
	import Button from '#lib/components/Button.svelte';
	import { heroStats } from '#lib/content/home-lists';
</script>

<section class="hero" id="home">
	<img class="hero-bg-photo" src="/images/img-02.jpg" alt="Golf course backdrop" width="700" height="933" fetchpriority="high" />
	<div class="hero-film"></div>
	<svg class="contour-bg" viewBox="0 0 1200 800" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
		<g fill="none" stroke-width="1">
			<ellipse cx="950" cy="180" rx="360" ry="220" opacity="0.35" />
			<ellipse cx="950" cy="180" rx="290" ry="175" opacity="0.3" />
			<ellipse cx="950" cy="180" rx="220" ry="132" opacity="0.28" />
			<ellipse cx="950" cy="180" rx="150" ry="90" opacity="0.24" />
			<ellipse cx="150" cy="700" rx="300" ry="180" opacity="0.22" />
			<ellipse cx="150" cy="700" rx="220" ry="132" opacity="0.2" />
			<ellipse cx="150" cy="700" rx="140" ry="84" opacity="0.18" />
		</g>
	</svg>
	<div class="wrap">
		<div class="hero-grid">
			<div>
				<div class="hero-eyebrow"><span class="dot"></span>PGA Coaching · Durham, NC</div>
				<h1>PGA Golf Lessons<br />in <em>Durham, NC.</em></h1>
				<p class="hero-sub">Individualized PGA golf coaching at Dick’s House of Sport in Durham — helping golfers throughout the Triangle, including Raleigh, Cary, and Chapel Hill, practice with purpose and perform with confidence.</p>
				<div class="hero-actions">
					<Button href="#assessment" variant="gold">Schedule a Golf Performance Assessment</Button>
					<Button href="#lessons" variant="outline-light">Explore Coaching</Button>
				</div>
				<div class="hero-stats">
					{#each heroStats as stat}
						<div><strong>{stat.label}</strong><span>{stat.sub}</span></div>
					{/each}
				</div>
			</div>
			<div class="hero-visual">
				<img src="/images/img-03.jpg" alt="Coach and junior golfer on the range in Wyoming" class="hero-photo" width="900" height="1200" />
				<div class="hero-photo-frame"></div>
			</div>
		</div>
	</div>
</section>

<style>
	.hero {
		padding: 150px 0 80px; position: relative; overflow: hidden;
		background: linear-gradient(180deg, var(--green-top) 0%, var(--green) 55%, var(--green-deep) 100%);
		color: var(--white);
		border-bottom: 1px solid rgb(255 255 255 / 0.12);
	}
	.hero-bg-photo {
		position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover;
		object-position: center 35%; z-index: 0;
	}
	.hero-film {
		position: absolute; inset: 0; z-index: 0;
		background: linear-gradient(180deg, rgb(13 63 46 / 0.9) 0%, rgb(11 79 58 / 0.82) 45%, rgb(8 57 42 / 0.94) 100%);
	}
	.hero .wrap { position: relative; z-index: 2; }
	.hero-grid { display: grid; gap: 44px; align-items: center; }
	@media (min-width: 960px) {
		.hero { padding: 190px 0 120px; }
		.hero-grid { grid-template-columns: 1.05fr 0.95fr; gap: 40px; }
	}
	.hero-eyebrow {
		display: inline-flex; align-items: center; gap: 8px; padding: 8px 16px 8px 8px;
		background: rgb(255 255 255 / 0.08); border: 1px solid rgb(255 255 255 / 0.18);
		border-radius: 100px; font-family: var(--font-display); font-size: 12px; font-weight: 600;
		letter-spacing: 0.08em; text-transform: uppercase; color: var(--gold-soft); margin-bottom: 26px;
	}
	.dot { width: 8px; height: 8px; border-radius: 50%; background: var(--gold); display: inline-block; }
	h1 {
		font-size: clamp(40px, 7.4vw, 68px); font-weight: 800; line-height: 1.03; letter-spacing: -0.02em; color: var(--white);
	}
	h1 em { font-style: normal; color: var(--gold-soft); }
	.hero-sub { margin-top: 22px; font-size: 18px; line-height: 1.7; color: rgb(255 255 255 / 0.82); max-width: 480px; }
	.hero-actions { display: flex; flex-wrap: wrap; gap: 14px; margin-top: 34px; }
	.hero-stats { display: flex; gap: 28px; margin-top: 48px; flex-wrap: wrap; }
	.hero-stats div { border-left: 2px solid rgb(212 160 23 / 0.55); padding-left: 14px; }
	.hero-stats strong { display: block; font-family: var(--font-display); font-size: 22px; font-weight: 700; color: var(--white); }
	.hero-stats span { font-size: 12.5px; color: rgb(255 255 255 / 0.68); text-transform: uppercase; letter-spacing: 0.06em; }

	.hero-visual { position: relative; height: 340px; }
	@media (min-width: 960px) { .hero-visual { height: 460px; } }
	.hero-photo {
		width: 100%; height: 100%; object-fit: cover; object-position: center 10%; border-radius: var(--radius-lg);
		box-shadow: var(--shadow-hero); position: relative; z-index: 1;
	}
	.hero-photo-frame {
		position: absolute; inset: 0; border-radius: var(--radius-lg);
		box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.18); pointer-events: none; z-index: 2;
	}
	.contour-bg { position: absolute; inset: 0; width: 100%; height: 100%; z-index: 1; opacity: 0.35; pointer-events: none; }
	.contour-bg g { stroke: var(--gold); }
</style>
