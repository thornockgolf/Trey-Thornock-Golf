<script lang="ts">
	import { siteConfig } from '@ttg/shared';
</script>

<footer>
	<div class="wrap">
		<div class="footer-links">
			<a href="/">Home</a>
			<a href="/#pricing">Pricing</a>
			<a href="/#locations">Locations</a>
			<a href="/#contact">Contact</a>
			<a href={siteConfig.bookingUrl} target="_blank" rel="noopener">Book a Lesson</a>
		</div>
		Trey Thornock Golf &middot; Dick&rsquo;s House of Sport, Durham, NC &middot; <a class="site" href="/">treythornockgolf.com</a>
	</div>
</footer>

<style>
	footer { background: var(--green-deep); color: rgb(255 255 255 / 0.75); padding: 34px 0 26px; text-align: center; font-size: 13.5px; border-top: 1px solid rgb(255 255 255 / 0.12); }
	.wrap { max-width: var(--container-reading); margin: 0 auto; padding: 0 22px; }
	.site { color: var(--gold-soft); }
	.footer-links { display: flex; flex-wrap: wrap; justify-content: center; gap: 18px; margin-bottom: 16px; font-family: var(--font-display); font-size: 13px; font-weight: 600; }
	.footer-links a { color: rgb(255 255 255 / 0.8); }
	.footer-links a:hover { color: var(--gold-soft); }
</style>
