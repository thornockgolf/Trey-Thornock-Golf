<script lang="ts">
	import { siteConfig } from '@ttg/shared';
	import Button from './Button.svelte';
</script>

<header>
	<div class="wrap">
		<a class="brand" href="/">
			<span class="brand-mark"><img src="/images/img-01.png" alt="Trey Thornock Golf logo" width="38" height="38" /></span>
			<span class="brand-text">TREY THORNOCK<span>Golf Coaching</span></span>
		</a>
		<div class="header-actions">
			<a class="home-link" href="/">&larr; Home</a>
			<Button href={siteConfig.bookingUrl} small>Book a Lesson</Button>
		</div>
	</div>
</header>

<style>
	header { background: var(--green); padding: 14px 0; border-bottom: 1px solid rgb(255 255 255 / 0.12); }
	.wrap { max-width: var(--container-reading); margin: 0 auto; padding: 0 22px; display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
	.brand { display: flex; align-items: center; gap: 10px; }
	.brand-mark { width: 38px; height: 38px; border-radius: 50%; overflow: hidden; flex-shrink: 0; background: var(--white); }
	.brand-mark img { width: 100%; height: 100%; object-fit: cover; display: block; }
	.brand-text { font-family: var(--font-display); font-weight: 700; color: var(--white); font-size: 14px; line-height: 1.25; display: flex; flex-direction: column; }
	.brand-text span { font-family: var(--font-body); font-weight: 400; font-size: 11px; color: rgb(255 255 255 / 0.72); text-transform: none; letter-spacing: 0; }
	.header-actions { display: flex; align-items: center; gap: 18px; }
	.home-link { color: rgb(255 255 255 / 0.85); font-size: 13.5px; font-weight: 600; }
	.home-link:hover { color: var(--gold-soft); }
</style>
