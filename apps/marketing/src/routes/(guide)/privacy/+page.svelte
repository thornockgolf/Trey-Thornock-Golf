<script lang="ts">
	import { siteConfig } from '@ttg/shared';
	import LegalPage from '#lib/components/LegalPage.svelte';
</script>

<LegalPage
	title="Privacy Policy | Trey Thornock Golf"
	heading="Privacy Policy"
	description="How Trey Thornock Golf collects, uses and protects your information, including swing videos, coaching data and payments."
	path="/privacy"
	updated="October 13, 2026"
>
	<p>This policy explains what {siteConfig.name} (“Trey Thornock Golf”, “we”, “us”) collects when you visit treythornockgolf.com or use the coaching app at app.treythornockgolf.com, how we use it, and the choices you have. Questions can go to <a href="mailto:{siteConfig.email}">{siteConfig.email}</a>.</p>

	<h2>What we collect</h2>
	<ul>
		<li><strong>Account details:</strong> your name, email address and sign-in details, handled by our sign-in provider.</li>
		<li><strong>Profile and intake answers:</strong> handicap, goals, home course, dominant hand, equipment, injuries or physical limitations you tell us about, and an optional profile photo.</li>
		<li><strong>Swing videos and coaching content:</strong> videos you upload, notes, check-ins and test results, plus the drawings, voice or camera commentary and practice plans your coach creates for you. Videos can show you, and sometimes people nearby, and may include audio.</li>
		<li><strong>Messages:</strong> chat messages between you and your coach, and in-app notifications.</li>
		<li><strong>Payments:</strong> when you buy an assessment or membership, Stripe collects your card and billing details. We receive confirmation, the product, the amount and a customer reference, never your full card number.</li>
		<li><strong>Basic technical data:</strong> standard server logs such as IP address, browser type and requested page, used to keep the service running and secure.</li>
		<li><strong>Contact and newsletter:</strong> if you email or call us, or sign up for tips, we keep what you send. The newsletter sign-up is a Google Form.</li>
	</ul>
	<p>We don’t use advertising trackers or sell your information. The marketing site doesn’t set advertising cookies. The app uses cookies and local storage that are needed to keep you signed in and to run the installed app.</p>

	<h2>How we use it</h2>
	<ul>
		<li>To provide coaching: review your swings, build analyses and practice plans, and communicate with you.</li>
		<li>To process payments and give you access to what you’ve paid for.</li>
		<li>To send service messages such as video-ready notices, new messages and plan updates.</li>
		<li>To secure the service, fix problems and meet legal obligations.</li>
	</ul>

	<h2>Who can see your content</h2>
	<p>Your videos, notes and messages are visible to you and to your assigned coach, Trey Thornock. Other players can’t see them. Reference videos that Trey publishes to a shared library are visible to signed-in players. Trey also keeps private coaching notes about players that you can’t see. We don’t share your content publicly or use it in marketing without asking you first.</p>

	<h2>Service providers</h2>
	<p>We use these providers to run the service, and they handle data only on our behalf:</p>
	<ul>
		<li><strong>Clerk</strong>, sign-in and account management.</li>
		<li><strong>Stripe</strong>, payments and billing.</li>
		<li><strong>Cloudflare R2</strong>, storage for videos, recordings and profile photos.</li>
		<li><strong>Hostinger</strong>, the server that runs the app, its database and chat.</li>
		<li><strong>Netlify</strong>, hosting for this marketing site.</li>
		<li><strong>Google</strong>, the newsletter form.</li>
		<li><strong>Dick’s House of Sport</strong>, its scheduling system, if you book a lesson through it. Their policy applies to that booking.</li>
	</ul>
	<p>We may also disclose information if the law requires it or to protect people’s safety.</p>

	<h2>How long we keep it</h2>
	<p>We keep your account, videos and coaching history while your account is active, because your progress over time is the point of the service. We keep your original uploaded video files, not only the converted copies. Coach recordings that have been replaced are removed after 30 days. Billing records are kept as long as tax and accounting rules require.</p>

	<h2>Your choices</h2>
	<p>You can ask us to show you what we hold, correct it, or delete your account and content by emailing <a href="mailto:{siteConfig.email}">{siteConfig.email}</a>. We’ll act on verified requests within a reasonable time. Deleting an account removes your sign-in, videos, recordings, messages, plans, notes and history, and cancels any membership. We keep payment records, stripped of your name and email, because tax and accounting rules require it. You can cancel a membership at any time from the billing page. You can unsubscribe from the newsletter whenever you like.</p>

	<h2>Children</h2>
	<p>Junior golfers are welcome, but the app is for people 13 and older. A player under 18 needs a parent or guardian to create or approve the account, to agree to this policy and to the terms, and to make any purchases. If you believe a child under 13 has signed up, tell us and we’ll delete the account.</p>

	<h2>Security</h2>
	<p>Videos upload directly to private storage over encrypted connections and are only served to people allowed to see them through short-lived links. No system is perfectly secure, so we can’t promise absolute security, but we limit access and take reasonable steps to protect your information.</p>

	<h2>Changes</h2>
	<p>If we change this policy we’ll update the date above and, for significant changes, tell signed-in players.</p>
</LegalPage>
