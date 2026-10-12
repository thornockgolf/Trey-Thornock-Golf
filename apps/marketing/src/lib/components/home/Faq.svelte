<script lang="ts">
	import { reveal } from '#lib/actions/reveal';
	import { faqItems } from '#lib/content/faq';
</script>

<section class="section-pad" id="faq">
	<div class="wrap faq-wrap">
		<div class="section-head" use:reveal>
			<div class="eyebrow">FAQ</div>
			<h2>Frequently Asked Questions</h2>
		</div>
		<!-- Native <details>/<summary>, as in legacy: keyboard operable (Enter/Space) with no JS. -->
		<div class="faq-list" use:reveal>
			{#each faqItems as item (item.question)}
				<details class="faq-item">
					<summary>{item.question}</summary>
					<p class:placeholder-box={item.placeholder}>{item.answer}</p>
				</details>
			{/each}
		</div>
	</div>
</section>

<style>
	.faq-wrap { max-width: 820px; }
	.faq-list { display: flex; flex-direction: column; gap: 12px; }
	.faq-item {
		background: var(--alt-bg); border: 1px solid var(--card-border); border-radius: 14px; padding: 6px 22px;
	}
	.faq-item summary {
		font-family: var(--font-display); font-weight: 600; font-size: 15px; color: var(--heading);
		padding: 16px 0; cursor: pointer; list-style: none; display: flex; align-items: center; justify-content: space-between; gap: 14px;
	}
	.faq-item summary::-webkit-details-marker { display: none; }
	.faq-item summary::after {
		content: '+'; font-size: 22px; color: var(--eyebrow); font-weight: 400; flex-shrink: 0; transition: transform 0.25s ease;
	}
	.faq-item[open] summary::after { transform: rotate(45deg); }
	.faq-item p { padding-bottom: 18px; font-size: 14.5px; color: var(--text-muted); line-height: 1.7; }
	.faq-item p.placeholder-box {
		background: var(--page-bg); border: 1.5px dashed var(--line); border-radius: 12px; padding: 16px 18px;
		font-size: 14px; color: var(--text-muted); font-style: italic; margin-top: 14px; margin-bottom: 18px;
	}
</style>
