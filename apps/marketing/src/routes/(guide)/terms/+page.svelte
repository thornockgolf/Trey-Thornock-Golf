<script lang="ts">
	import { siteConfig } from '@ttg/shared';
	import LegalPage from '#lib/components/LegalPage.svelte';
</script>

<LegalPage
	title="Terms of Service | Trey Thornock Golf"
	heading="Terms of Service"
	description="The terms for using the Trey Thornock Golf website and coaching app, including uploaded videos, payments and cancellations."
	path="/terms"
	updated="October 13, 2026"
>
	<p>These terms apply to treythornockgolf.com and the coaching app at app.treythornockgolf.com, run by {siteConfig.name}. By creating an account or using the service you agree to them and to our <a href="/privacy">Privacy Policy</a>. If you don’t agree, please don’t use the service.</p>

	<h2>The service</h2>
	<p>The app lets players upload swing videos, receive video analysis and practice plans from their coach, message the coach, and manage payments. Coaching in the app supports, and doesn’t replace, in-person lessons. We may change, add or remove features as the app develops.</p>

	<h2>Accounts</h2>
	<ul>
		<li>You must be 13 or older. Players under 18 need a parent or guardian to set up or approve the account and to accept these terms. That adult is responsible for the account and any purchases.</li>
		<li>Give accurate information and keep your sign-in secure. You’re responsible for activity under your account.</li>
		<li>One account per person. Don’t share your account.</li>
	</ul>

	<h2>Your videos and content</h2>
	<p>You keep ownership of the videos, photos, messages and other content you upload. You give Trey Thornock Golf permission to store, process (for example, convert video formats), display to you and your coach, and use that content to provide coaching to you. We won’t use your content publicly, such as in marketing, without your separate permission.</p>
	<p>Only upload content you have the right to share. Don’t upload videos of other people who haven’t agreed to appear in them, and nothing unlawful, harmful, harassing or sexually explicit. We may remove content or suspend accounts that break these rules.</p>

	<h2>Golf and health</h2>
	<p>Golf involves physical activity and a risk of injury. Coaching advice and practice plans are general instruction for golf technique, not medical advice. Tell your coach about any injury or limitation, and check with a doctor before starting anything that may be unsafe for you. You take part at your own risk and are responsible for practising safely.</p>

	<h2>Payments, memberships and refunds</h2>
	<ul>
		<li>Payments are processed by Stripe. Prices are shown at checkout in US dollars.</li>
		<li>The Golf Performance Assessment is a one-time purchase. Memberships renew automatically each month until you cancel.</li>
		<li>You can cancel a membership at any time from the billing page. Cancellation stops future charges and you keep access until the end of the period you’ve paid for.</li>
		<li>Payments are generally non-refundable, but if something went wrong, contact us at <a href="mailto:{siteConfig.email}">{siteConfig.email}</a> and we’ll look at it fairly.</li>
		<li>Lessons booked through Dick’s House of Sport follow that scheduling system’s own terms and cancellation rules.</li>
	</ul>

	<h2>Our content</h2>
	<p>The website, the app, the coaching materials, drills, reference videos and branding belong to Trey Thornock Golf or its licensors. Use them for your own personal training only. Don’t copy, resell or republish them.</p>

	<h2>Acceptable use</h2>
	<p>Don’t try to break into the service, interfere with it, scrape it, or use it to harm others. We may suspend or end accounts that do, and you can close your account at any time by emailing us.</p>

	<h2>No guarantees; limits on liability</h2>
	<p>We work hard to keep the service available, but it’s provided “as is”, and we can’t promise it will always be uninterrupted or error-free, or that coaching will lower your scores. To the extent the law allows, Trey Thornock Golf is not liable for indirect or consequential losses, and our total liability for any claim is limited to what you paid us in the 12 months before it. Nothing here limits rights you have by law that can’t be waived.</p>

	<h2>Governing law</h2>
	<p>These terms are governed by the laws of the State of North Carolina, and disputes will be handled in the courts located there, unless the law requires otherwise.</p>

	<h2>Changes and contact</h2>
	<p>We may update these terms and will change the date above; for significant changes we’ll notify signed-in players. Continuing to use the service after a change means you accept it. Questions: <a href="mailto:{siteConfig.email}">{siteConfig.email}</a> or {siteConfig.phone.display}.</p>
</LegalPage>
