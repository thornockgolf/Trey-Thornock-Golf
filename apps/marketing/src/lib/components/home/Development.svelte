<script lang="ts">
	import { reveal } from '#lib/actions/reveal';
	import { pathwaySteps } from '#lib/content/pathway';
</script>

<section class="section-pad pathway-section" id="development">
	<svg class="contour-bg" viewBox="0 0 1200 800" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
		<g fill="none" stroke-width="1">
			<ellipse cx="1050" cy="620" rx="380" ry="230" />
			<ellipse cx="1050" cy="620" rx="300" ry="182" />
			<ellipse cx="1050" cy="620" rx="220" ry="134" />
		</g>
	</svg>
	<div class="wrap">
		<div class="section-head on-dark" use:reveal>
			<div class="eyebrow on-dark">The Development System</div>
			<h2>The Trey Thornock Golf Development System</h2>
			<p>A great lesson should not be an isolated experience. Every lesson should build on what came before it and create a clear next step.</p>
		</div>

		<ol class="pathway-list">
			{#each pathwaySteps as step}
				<li class="pathway-item" use:reveal>
					<div class="pathway-line"><div class="pathway-node">{step.num}</div></div>
					<div class="pathway-copy"><h3>{step.title}</h3><p>{step.text}</p></div>
				</li>
			{/each}
		</ol>

		<p class="pathway-tagline" use:reveal>The goal isn’t to build a prettier swing. The goal is to build a better golfer.</p>
	</div>
</section>

<style>
	.pathway-section {
		background: linear-gradient(180deg, var(--green-deep), var(--green-bottom));
		color: var(--white); overflow: hidden; border-block: 1px solid rgb(255 255 255 / 0.12);
	}
	.contour-bg { position: absolute; inset: 0; width: 100%; height: 100%; z-index: 1; opacity: 0.18; pointer-events: none; }
	.contour-bg g { stroke: var(--gold); }
	.pathway-section .wrap { position: relative; z-index: 2; }
	.pathway-list { display: flex; flex-direction: column; gap: 0; margin: 50px 0 0; padding: 0; list-style: none; position: relative; }
	.pathway-item { display: grid; grid-template-columns: 56px 1fr; gap: 20px; padding-bottom: 36px; position: relative; }
	.pathway-item:last-child { padding-bottom: 0; }
	.pathway-line { position: relative; display: flex; flex-direction: column; align-items: center; }
	.pathway-node {
		width: 44px; height: 44px; border-radius: 50%; background: rgb(212 160 23 / 0.14);
		border: 1.5px solid var(--gold); display: flex; align-items: center; justify-content: center;
		font-family: var(--font-display); font-weight: 700; font-size: 14px; color: var(--gold-soft); flex-shrink: 0; z-index: 2;
	}
	.pathway-item:not(:last-child) .pathway-line::after {
		content: ''; position: absolute; top: 44px; bottom: -36px; width: 1px;
		background: repeating-linear-gradient(to bottom, rgb(212 160 23 / 0.55) 0 6px, transparent 6px 12px);
	}
	.pathway-copy h3 { color: var(--white); font-size: 19px; font-weight: 700; margin-bottom: 6px; }
	.pathway-copy p { color: rgb(255 255 255 / 0.68); font-size: 14.5px; }
	.pathway-tagline {
		text-align: center; max-width: 640px; margin: 56px auto 0; font-family: var(--font-display);
		font-size: 19px; font-weight: 600; color: var(--gold-soft); line-height: 1.5; padding-top: 36px;
		border-top: 1px solid rgb(255 255 255 / 0.15);
	}
	@media (min-width: 860px) {
		.pathway-list { flex-direction: row; gap: 0; margin-top: 64px; }
		.pathway-item { grid-template-columns: none; flex: 1; display: flex; flex-direction: column; align-items: center; text-align: center; padding: 0 14px; }
		.pathway-line { flex-direction: row; width: 100%; justify-content: center; }
		.pathway-item:not(:last-child) .pathway-line::after {
			content: ''; position: absolute; left: calc(50% + 30px); right: calc(-50% + 30px); top: 22px; bottom: auto; height: 1px; width: auto;
			background: repeating-linear-gradient(to right, rgb(212 160 23 / 0.55) 0 6px, transparent 6px 12px);
		}
		.pathway-copy { margin-top: 20px; }
	}
</style>
