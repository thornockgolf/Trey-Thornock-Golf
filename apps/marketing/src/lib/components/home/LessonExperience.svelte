<script lang="ts">
	import { reveal } from '#lib/actions/reveal';

	const steps = [
		{ num: '01', title: 'Connect', text: 'We start by understanding your goals and where your game is today.' },
		{ num: '02', title: 'Assess', text: 'We observe your current performance before deciding what needs attention.' },
		{ num: '03', title: 'Focus', text: 'We identify the one priority that can make the biggest difference.' },
		{ num: '04', title: 'Train', text: 'We work through simple instruction and purposeful practice.' },
		{ num: '05', title: 'Transfer', text: 'We take the skill to the golf course.' },
		{ num: '06', title: 'Plan', text: 'You leave knowing exactly what to work on next.' }
	];
</script>

<section class="section-pad" id="lesson-experience">
	<div class="wrap">
		<div class="section-head" use:reveal>
			<div class="eyebrow">What to Expect</div>
			<h2>The Lesson Experience</h2>
			<p>A clear, comfortable process from your first conversation to your next step.</p>
		</div>
		<div class="exp-grid">
			{#each steps as step (step.num)}
				<div class="exp-card" use:reveal>
					<span class="exp-num">{step.num}</span>
					<h3>{step.title}</h3>
					<p>{step.text}</p>
				</div>
			{/each}
		</div>
	</div>
</section>

<style>
	.exp-grid { display: grid; gap: 20px; grid-template-columns: 1fr; margin-top: 46px; }
	@media (min-width: 700px) { .exp-grid { grid-template-columns: repeat(2, 1fr); } }
	@media (min-width: 1080px) { .exp-grid { grid-template-columns: repeat(3, 1fr); } }
	.exp-card {
		padding: 26px; border-radius: var(--radius-md); background: var(--card-bg);
		border: 1px solid var(--line); position: relative;
		transition: border-color 0.3s ease, transform 0.3s ease;
	}
	.exp-card:hover { border-color: var(--gold); transform: translateY(-4px); }
	.exp-num {
		font-family: var(--font-display); font-weight: 800; font-size: 34px; color: var(--line);
		line-height: 1; margin-bottom: 10px; transition: color 0.3s ease;
	}
	.exp-card:hover .exp-num { color: var(--gold); }
	.exp-card h3 { font-size: 16.5px; font-weight: 700; margin-bottom: 8px; letter-spacing: 0.02em; }
	.exp-card p { font-size: 14px; color: var(--text-muted); }
</style>
