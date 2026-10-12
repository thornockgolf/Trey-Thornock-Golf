<script lang="ts">
	import { reveal } from '#lib/actions/reveal';
	import { priceTabs, usKidsProgram } from '#lib/content/pricing';

	let active = $state(0);
	let tabEls: HTMLButtonElement[] = $state([]);

	function select(i: number, focus = false) {
		active = i;
		if (focus) tabEls[i]?.focus();
	}

	function onKeydown(e: KeyboardEvent) {
		const n = priceTabs.length;
		let next: number | null = null;
		if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (active + 1) % n;
		else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (active - 1 + n) % n;
		else if (e.key === 'Home') next = 0;
		else if (e.key === 'End') next = n - 1;
		if (next === null) return;
		e.preventDefault();
		select(next, true);
	}
</script>

<section class="section-pad pricing-section" id="pricing">
	<div class="wrap">
		<div class="section-head" use:reveal>
			<div class="eyebrow">Pricing &middot; Dick’s House of Sport</div>
			<h2>Investment in Your Game</h2>
			<p>Rates for individual lessons at Dick’s House of Sport in Durham, NC.</p>
		</div>

		<div class="price-tabs" use:reveal>
			<div class="price-tab-buttons" role="tablist" aria-label="Lesson pricing" tabindex="-1" onkeydown={onKeydown}>
				{#each priceTabs as tab, i (tab.id)}
					<button
						bind:this={tabEls[i]}
						class="price-tab-btn"
						class:active={active === i}
						type="button"
						role="tab"
						id="price-tab-{tab.id}"
						aria-selected={active === i}
						aria-controls="price-panel-{tab.id}"
						tabindex={active === i ? 0 : -1}
						onclick={() => select(i)}>{tab.label}</button
					>
				{/each}
			</div>

			{#each priceTabs as tab, i (tab.id)}
				<div
					class="price-tab-panel"
					role="tabpanel"
					id="price-panel-{tab.id}"
					aria-labelledby="price-tab-{tab.id}"
					hidden={active !== i}
				>
					<div class="price-panel-inner">
						{#each tab.groups as group}
							{#if group.heading}<h4 class="price-subhead">{group.heading}</h4>{/if}
							<ul class="price-list">
								{#each group.rows as row (row.label)}
									<li><span>{row.label}</span><span>{row.price}</span></li>
								{/each}
							</ul>
						{/each}

						{#if tab.id === 'youth'}
							<div class="uskids-box">
								<span class="uskids-badge">{usKidsProgram.badge}</span>
								<div class="uskids-head">
									<h4>{usKidsProgram.title}</h4>
									<div class="uskids-price">{usKidsProgram.price}</div>
								</div>
								<ul class="uskids-list">
									{#each usKidsProgram.points as point (point)}
										<li>
											<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6L9 17l-5-5" /></svg>{point}
										</li>
									{/each}
								</ul>
							</div>
						{/if}
					</div>
				</div>
			{/each}
		</div>
	</div>
</section>

<style>
	.pricing-section { background: var(--alt-bg); }
	.price-tabs { margin-top: 10px; }
	.price-tab-buttons { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; margin-bottom: 30px; }
	.price-tab-btn {
		font-family: var(--font-display); font-weight: 600; font-size: 12.5px; letter-spacing: 0.03em;
		padding: 11px 18px; border-radius: 100px; border: 1.5px solid var(--line); background: var(--card-bg);
		color: var(--text-muted); cursor: pointer; transition: all 0.25s ease;
	}
	.price-tab-btn:hover { border-color: var(--green); }
	.price-tab-btn.active { background: var(--green); border-color: var(--green); color: var(--white); }
	.price-tab-panel { max-width: 760px; margin: 0 auto; }
	.price-tab-panel:not([hidden]) { animation: fadeIn 0.35s ease; }
	@keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
	@media (prefers-reduced-motion: reduce) { .price-tab-panel:not([hidden]) { animation: none; } }
	.price-panel-inner {
		background: var(--card-bg); border-radius: var(--radius-lg); padding: 32px 30px; box-shadow: var(--shadow-soft);
		border: 1px solid var(--card-border);
	}
	.price-subhead {
		font-family: var(--font-display); font-size: 13px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase;
		color: var(--heading); margin: 0 0 14px; padding-bottom: 10px; border-bottom: 2px solid var(--line);
	}
	.price-subhead:not(:first-child) { margin-top: 30px; }
	.price-list { list-style: none; margin: 0 0 6px; padding: 0; display: flex; flex-direction: column; }
	.price-list li {
		display: flex; align-items: baseline; justify-content: space-between; gap: 14px;
		padding: 11px 0; border-bottom: 1px dashed var(--line); font-size: 14.5px; color: var(--text);
	}
	.price-list li:last-child { border-bottom: none; }
	.price-list li span:first-child { color: var(--text); }
	.price-list li span:last-child { font-family: var(--font-display); font-weight: 700; color: var(--icon-stroke); white-space: nowrap; }

	.uskids-box {
		margin-top: 28px; padding: 26px; border-radius: 16px;
		background: linear-gradient(160deg, var(--green), var(--green-deep)); color: var(--white);
		position: relative; overflow: hidden; border: 1px solid rgb(255 255 255 / 0.12);
	}
	.uskids-badge {
		display: inline-block; font-family: var(--font-display); font-weight: 700; font-size: 11px;
		letter-spacing: 0.08em; text-transform: uppercase; color: var(--navy); background: var(--gold-soft);
		padding: 6px 12px; border-radius: 100px; margin-bottom: 14px;
	}
	.uskids-head { display: flex; align-items: baseline; justify-content: space-between; flex-wrap: wrap; gap: 10px; }
	.uskids-head h4 {
		font-family: var(--font-display); font-size: 18px; font-weight: 700; color: var(--white); margin: 0;
		text-transform: none; letter-spacing: 0; border: none; padding: 0;
	}
	.uskids-price { font-family: var(--font-display); font-weight: 800; font-size: 26px; color: var(--gold-soft); }
	.uskids-list { list-style: none; margin: 16px 0 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
	.uskids-list li { display: flex; align-items: flex-start; gap: 10px; font-size: 14px; color: rgb(255 255 255 / 0.9); line-height: 1.5; }
	.uskids-list li svg { width: 17px; height: 17px; stroke: var(--gold-soft); flex-shrink: 0; margin-top: 1px; }
</style>
