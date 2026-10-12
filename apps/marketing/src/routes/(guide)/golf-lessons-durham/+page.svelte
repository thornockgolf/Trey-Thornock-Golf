<script lang="ts">
	import Seo from '#lib/components/Seo.svelte';
	import { reveal } from '#lib/actions/reveal';
	import { durhamFaqs, durhamPrograms, getStartedSteps, lessonSteps } from '#lib/content/guide-durham';
</script>

<Seo
	title="Golf Lessons in Durham, NC | PGA Coaching — Trey Thornock Golf"
	description="PGA golf lessons in Durham, NC at Dick's House of Sport. Private lessons for beginners, adults, and juniors, plus Golf Performance Assessments and player development with PGA Professional Trey Thornock."
	path="/golf-lessons-durham"
	jsonLdDescription="PGA golf lessons in Durham, NC with PGA Professional Trey Thornock at Dick's House of Sport."
/>

<section class="hero">
	<div class="wrap">
		<div class="eyebrow">Dick’s House of Sport · Durham, NC</div>
		<h1>Golf Lessons in Durham, NC</h1>
		<p class="lead">Golf lessons with PGA Professional Trey Thornock for beginners, adults, and juniors — built around your game, your goals, and a clear path to better golf. Trey coaches out of Dick’s House of Sport in Durham and works with golfers throughout the Triangle, including Raleigh, Cary, and Chapel Hill.</p>
		<a href="/#assessment" class="guide-btn gold">Schedule a Golf Performance Assessment</a>
		<a href="/#pricing" class="guide-btn outline">See Lesson Pricing</a>
	</div>
</section>

<section>
	<div class="wrap">
		<div class="eyebrow">Golf Instruction, Done Right</div>
		<h2>PGA Golf Coaching Built Around the Individual Golfer</h2>
		<p class="lead">Every golfer who walks into a lesson is different — different swing, different goals, different starting point. Trey Thornock Golf uses an assessment-driven coaching system (Assess, Identify, Develop, Practice, Transfer, Perform) instead of a one-size-fits-all swing method, so every lesson connects to the one before it and builds toward a clear next step. That’s the difference between collecting swing tips and actually playing better golf.</p>
	</div>
</section>

<section class="alt">
	<div class="wrap">
		<div class="eyebrow">Programs</div>
		<h2>Golf Lesson Programs in Durham</h2>
		<div class="grid-2">
			{#each durhamPrograms as program (program.title)}
				<div class="guide-card" use:reveal>
					<h3>{program.title}</h3>
					<p>{program.body}</p>
				</div>
			{/each}
		</div>
	</div>
</section>

<section>
	<div class="wrap">
		<div class="eyebrow">Start Here</div>
		<h2>Every Coaching Path Starts With a Golf Performance Assessment</h2>
		<p class="lead">Before making a change to your swing, Trey first needs to understand your game as a whole — ball flight, TrackMan data, contact, and your goals. The Golf Performance Assessment identifies the biggest opportunities for improvement and recommends the right coaching path, whether that’s private lessons, junior development, or online coaching.</p>
		<a href="/#assessment" class="guide-btn gold">Schedule a Golf Performance Assessment</a>
	</div>
</section>

<section class="alt">
	<div class="wrap">
		<div class="eyebrow">What to Expect</div>
		<h2>What Happens During a Golf Lesson</h2>
		<p class="lead" style="margin-bottom:22px;">A golf lesson with Trey follows the same clear process every time, so you always know what you’re working on and why.</p>
		<ol class="step-list">
			{#each lessonSteps as step (step.title)}
				<li><strong>{step.title}</strong>{step.body}</li>
			{/each}
		</ol>
	</div>
</section>

<section>
	<div class="wrap grid-2">
		<div>
			<div class="eyebrow">Coaching Approach</div>
			<h2>Technology &amp; Data With a Purpose</h2>
			<p>Trey coaches with TrackMan’s newest 3D motion capture technology, combining ball flight data with full-body swing motion. TrackMan provides the data — coaching determines what to do with it. As a PGA Member with TrackMan University Level 2 certification, Trey uses that data to help golfers understand cause and effect, not just hand them a list of numbers.</p>
		</div>
		<div>
			<div class="eyebrow">Location</div>
			<h2>Golf Lessons at Dick’s House of Sport, Durham</h2>
			<p>Lessons take place in an indoor coaching bay at Dick’s House of Sport — The Streets at Southpoint, 6910 Fayetteville Road, Durham, NC 27713. Because the bay is indoors, lessons aren’t cancelled by weather, and scheduling stays consistent week to week. Trey also serves golfers throughout the Triangle — including Raleigh, Cary, and Chapel Hill — and offers online coaching and private lessons beyond Durham upon request.</p>
		</div>
	</div>
</section>

<section class="alt">
	<div class="wrap">
		<div class="eyebrow">Get Started</div>
		<h2>How Golfers Get Started</h2>
		<ol class="step-list">
			{#each getStartedSteps as step (step.title)}
				<li><strong>{step.title}</strong>{step.body}</li>
			{/each}
		</ol>
		<a href="/#assessment" class="guide-btn gold">Schedule a Golf Performance Assessment</a>
	</div>
</section>

<section>
	<div class="wrap">
		<div class="eyebrow">FAQ</div>
		<h2>Golf Lessons in Durham — Frequently Asked Questions</h2>
		{#each durhamFaqs as faq (faq.question)}
			<details>
				<summary>{faq.question}</summary>
				<p>{faq.answer}</p>
			</details>
		{/each}
	</div>
</section>

<section class="cta-band">
	<div class="wrap">
		<h2>Ready to Start Golf Lessons in Durham?</h2>
		<p>Let’s talk about where your game is today and where you want it to go.</p>
		<a href="/#assessment" class="guide-btn gold">Schedule a Golf Performance Assessment</a>
	</div>
</section>

<style>
	/* Page-local styles. Legacy Durham buttons differ from the home buttons (14.5px, sentence case). */
	.hero {
		background: linear-gradient(180deg, var(--alt-bg), var(--page-bg));
		border-bottom: 1px solid var(--line);
	}
	.alt {
		background: var(--alt-bg);
	}
	.grid-2 {
		display: grid;
		gap: 26px;
	}
	@media (min-width: 760px) {
		.grid-2 {
			grid-template-columns: 1fr 1fr;
		}
	}
	.guide-btn {
		display: inline-block;
		font-family: var(--font-display);
		font-weight: 600;
		font-size: 14.5px;
		padding: 14px 26px;
		border-radius: 999px;
		margin-top: 8px;
		margin-right: 8px;
		border: 1.5px solid transparent;
		text-decoration: none;
	}
	.guide-btn.gold {
		background: var(--gold);
		color: var(--green-deep);
	}
	.guide-btn.outline {
		border-color: light-dark(var(--green), var(--gold-soft));
		color: light-dark(var(--green), var(--gold-soft));
	}
	.guide-card {
		background: var(--card-bg);
		border: 1px solid var(--card-border);
		border-radius: var(--radius-md);
		padding: 24px;
		box-shadow: var(--shadow-soft);
	}
	.step-list {
		list-style: none;
		margin: 0;
		padding: 0;
		counter-reset: step;
	}
	.step-list li {
		counter-increment: step;
		position: relative;
		padding-left: 44px;
		margin-bottom: 18px;
		color: var(--text-muted);
	}
	.step-list li::before {
		content: counter(step);
		position: absolute;
		left: 0;
		top: 0;
		width: 30px;
		height: 30px;
		border-radius: 50%;
		background: var(--green);
		color: var(--white);
		font-family: var(--font-display);
		font-weight: 700;
		font-size: 14px;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.step-list strong {
		display: block;
		color: var(--heading);
		font-family: var(--font-display);
		margin-bottom: 2px;
	}
	details {
		border-bottom: 1px solid var(--line);
		padding: 16px 0;
	}
	summary {
		font-family: var(--font-display);
		font-weight: 600;
		color: var(--heading);
		cursor: pointer;
		font-size: 15.5px;
	}
	details p {
		margin-top: 10px;
		color: var(--text-muted);
		font-size: 14.5px;
	}
	.cta-band {
		background: var(--green-deep);
		color: var(--white);
		text-align: center;
		border-top: 1px solid rgb(255 255 255 / 0.12);
		border-bottom: 1px solid rgb(255 255 255 / 0.12);
	}
	.cta-band h2 {
		color: var(--white);
	}
	.cta-band p {
		color: rgb(255 255 255 / 0.8);
		max-width: 520px;
		margin: 0 auto 18px;
	}
	@media (prefers-reduced-motion: no-preference) {
		.guide-btn {
			transition: transform 0.2s ease;
		}
		.guide-btn:hover {
			transform: translateY(-2px);
		}
	}
</style>
