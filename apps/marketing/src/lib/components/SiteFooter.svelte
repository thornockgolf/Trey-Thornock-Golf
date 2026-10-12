<script lang="ts">
	import { siteConfig } from '@ttg/shared';
	import { appLinks } from '#lib/app-links';

	const year = new Date().getFullYear();
</script>

<footer class="on-dark">
	<div class="wrap">
		<div class="footer-grid">
			<div class="footer-brand">
				<div class="footer-logo-card"><img src="/images/img-13.webp" alt="Trey Thornock Golf" width="150" height="150" /></div>
				<div class="foot-tagline">Practice With Purpose. Perform With Confidence.</div>
				<p class="contact">
					<a href={siteConfig.phone.tel}>{siteConfig.phone.display}</a><br /><a href="mailto:{siteConfig.email}">{siteConfig.email}</a>
				</p>
			</div>
			<div>
				<h5>Explore</h5>
				<ul>
					<li><a href="#home">Home</a></li>
					<li><a href="#lessons">Lessons</a></li>
					<li><a href="#junior">Junior Golf</a></li>
					<li><a href="#development">Player Development</a></li>
				</ul>
			</div>
			<div>
				<h5>Company</h5>
				<ul>
					<li><a href="#about">About</a></li>
					<li><a href="#testimonials">Testimonials</a></li>
					<li><a href="#contact">Contact</a></li>
					<li><a href={siteConfig.bookingUrl} target="_blank" rel="noopener">Book a Lesson</a></li>
					{#if appLinks}
						<li><a href={appLinks.signIn}>Sign In</a></li>
						<li><a href={appLinks.signUp}>Get Started</a></li>
					{/if}
				</ul>
			</div>
		</div>
		<div class="footer-bottom">
			<span>&copy; {year} Trey Thornock Golf. All rights reserved.</span>
			<span>Golf Lessons &amp; Junior Golf &middot; Durham, NC &amp; Douglas, WY</span>
		</div>
	</div>
</footer>

<style>
	footer { background: var(--green-deep); color: rgb(255 255 255 / 0.75); padding: 56px 0 26px; border-top: 1px solid rgb(255 255 255 / 0.12); }
	.wrap { max-width: var(--container-site); margin: 0 auto; padding: 0 22px; }
	.footer-grid { display: grid; gap: 36px; grid-template-columns: 1fr; }
	@media (min-width: 760px) { .footer-grid { grid-template-columns: 1.3fr 1fr 1fr; } }
	.footer-logo-card { background: var(--white); border-radius: 16px; padding: 20px 26px; display: inline-block; box-shadow: 0 10px 26px rgb(0 0 0 / 0.18); }
	.footer-logo-card img { display: block; width: 150px; height: auto; }
	.foot-tagline { font-family: var(--font-display); font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; font-size: 12.5px; color: var(--gold-soft); margin-top: 16px; }
	.contact { margin-top: 18px; font-size: 13.5px; max-width: 280px; line-height: 1.65; }
	.contact a:hover { color: var(--gold-soft); }
	h5 { font-family: var(--font-display); font-size: 12.5px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--white); margin: 0 0 16px; font-weight: 600; }
	ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 11px; }
	ul a { font-size: 14px; color: rgb(255 255 255 / 0.7); transition: color 0.2s ease; }
	ul a:hover { color: var(--gold-soft); }
	.footer-bottom { border-top: 1px solid rgb(255 255 255 / 0.1); margin-top: 44px; padding-top: 22px; display: flex; flex-direction: column; gap: 8px; font-size: 12.5px; color: rgb(255 255 255 / 0.65); }
	@media (min-width: 760px) { .footer-bottom { flex-direction: row; justify-content: space-between; } }
</style>
