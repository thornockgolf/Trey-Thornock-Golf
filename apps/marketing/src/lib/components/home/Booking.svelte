<script lang="ts">
	import { siteConfig } from '@ttg/shared';
	import { reveal } from '#lib/actions/reveal';
	import Button from '#lib/components/Button.svelte';

	let sent = $state(false);

	/** Builds a mailto: request and hands it to the visitor's email app. No server receives anything. */
	function onSubmit(e: SubmitEvent) {
		e.preventDefault();
		const form = e.currentTarget as HTMLFormElement;
		const val = (id: string) => (form.querySelector<HTMLInputElement>(`#${id}`)?.value ?? '').trim();
		const subject = encodeURIComponent('Lesson Request: ' + (val('lessonType') || 'General Inquiry'));
		const bodyLines = [
			'Name: ' + val('fName') + ' ' + val('lName'),
			'Email: ' + val('email'),
			'Phone: ' + val('phone'),
			'Golfer Name: ' + val('golferName'),
			'Age: ' + val('age'),
			'Experience Level: ' + val('experience'),
			'Lesson Type: ' + val('lessonType'),
			'Preferred Date: ' + val('prefDate'),
			'Preferred Time: ' + val('prefTime'),
			'',
			'Message:',
			val('message')
		];
		const body = encodeURIComponent(bodyLines.join('\n'));
		window.location.href = `mailto:${siteConfig.email}?subject=${subject}&body=${body}`;
		sent = true;
	}
</script>

<section class="section-pad booking-section" id="book">
	<svg class="contour-bg" viewBox="0 0 1200 800" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
		<g fill="none" stroke-width="1">
			<ellipse cx="150" cy="120" rx="320" ry="200" />
			<ellipse cx="150" cy="120" rx="240" ry="150" />
			<ellipse cx="150" cy="120" rx="160" ry="100" />
		</g>
	</svg>
	<div class="wrap">
		<div class="booking-grid">
			<div class="booking-intro" use:reveal>
				<div class="eyebrow on-dark">Get Started</div>
				<h2>Ready to Improve Your Game?</h2>
				<p>Let’s talk about where your game is today and where you want it to go.</p>
				<div class="booking-cta"><Button href={siteConfig.bookingUrl} variant="gold">Schedule a Lesson</Button></div>
				<div class="booking-contact-line first">
					<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3.1-8.7A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .3 2 .7 3a2 2 0 0 1-.5 2.1L8 10.1a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c1 .4 2 .6 3 .7a2 2 0 0 1 1.6 2z" /></svg>
					{siteConfig.phone.display}
				</div>
				<div class="booking-contact-line">
					<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="4" width="20" height="16" rx="2" /><path d="M2 7l10 6 10-6" /></svg>
					{siteConfig.email}
				</div>
				<div class="booking-contact-line">
					<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z" /><circle cx="12" cy="10" r="3" /></svg>
					Dick’s House of Sport &middot; Durham, NC &middot; also teaching periodically in Douglas, WY
				</div>
			</div>

			<div class="booking-form-wrap" use:reveal>
				<p class="booking-prompt">Prefer to send a message instead? Fill out the form below.</p>
				<form class="booking-form" id="bookingForm" onsubmit={onSubmit}>
					<div class="form-grid">
						<div class="form-field"><label for="fName">First Name</label><input type="text" id="fName" required /></div>
						<div class="form-field"><label for="lName">Last Name</label><input type="text" id="lName" required /></div>
						<div class="form-field"><label for="email">Email</label><input type="email" id="email" required /></div>
						<div class="form-field"><label for="phone">Phone</label><input type="tel" id="phone" required /></div>
						<div class="form-field"><label for="golferName">Golfer Name</label><input type="text" id="golferName" /></div>
						<div class="form-field"><label for="age">Age</label><input type="text" id="age" /></div>
						<div class="form-field">
							<label for="experience">Experience Level</label>
							<select id="experience">
								<option value="">Select one</option>
								<option>Beginner</option>
								<option>Intermediate</option>
								<option>Advanced</option>
								<option>Competitive</option>
							</select>
						</div>
						<div class="form-field">
							<label for="lessonType">Lesson Type</label>
							<select id="lessonType" required>
								<option value="">Select one</option>
								<option>Adult Lesson</option>
								<option>Junior Lesson</option>
								<option>Beginner Lesson</option>
								<option>Player Development</option>
								<option>Other</option>
							</select>
						</div>
						<div class="form-field"><label for="prefDate">Preferred Date</label><input type="date" id="prefDate" /></div>
						<div class="form-field"><label for="prefTime">Preferred Time</label><input type="time" id="prefTime" /></div>
						<div class="form-field full"><label for="message">Message</label><textarea id="message" placeholder="Tell Trey a bit about your game and your goals."></textarea></div>
					</div>
					<div class="submit-row"><Button type="submit" variant="gold" block>Request a Lesson</Button></div>
					<p class="form-note">This form prepares an email request to Trey Thornock Golf — it does not automatically confirm a lesson. Trey’s team will follow up to finalize your date and time.</p>
					<div class="form-success" id="formSuccess" role="status" hidden={!sent}>
						<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6L9 17l-5-5" /></svg>
						<span>Thanks! Your email app should now be open with your request ready to send. Once it’s sent, Trey’s team will reach out to confirm your lesson.</span>
					</div>
				</form>
			</div>
		</div>
	</div>
</section>

<style>
	.booking-section {
		background: var(--navy); color: var(--white); position: relative; overflow: hidden;
		border-top: 1px solid rgb(255 255 255 / 0.12); border-bottom: 1px solid rgb(255 255 255 / 0.12);
	}
	.contour-bg { position: absolute; inset: 0; z-index: 1; opacity: 0.14; pointer-events: none; width: 100%; height: 100%; }
	.contour-bg g { stroke: var(--gold); }
	.booking-section :global(.wrap) { position: relative; z-index: 2; }
	.booking-grid { display: grid; gap: 40px; }
	@media (min-width: 960px) { .booking-grid { grid-template-columns: 0.85fr 1.15fr; gap: 60px; } }
	.booking-intro h2 { color: var(--white); font-size: clamp(28px, 4.4vw, 38px); font-weight: 700; line-height: 1.15; }
	.booking-intro p { color: rgb(255 255 255 / 0.75); margin-top: 16px; font-size: 16px; line-height: 1.7; }
	.booking-cta { margin-top: 26px; }
	.booking-contact-line { display: flex; align-items: center; gap: 12px; margin-top: 24px; font-size: 14.5px; color: rgb(255 255 255 / 0.85); }
	.booking-contact-line.first { margin-top: 30px; }
	.booking-contact-line svg { width: 18px; height: 18px; stroke: var(--gold-soft); flex-shrink: 0; }
	.booking-prompt { color: rgb(255 255 255 / 0.6); font-size: 13px; margin-bottom: 14px; }

	.booking-form {
		background: var(--card-bg); border-radius: var(--radius-lg); padding: 30px 24px; box-shadow: var(--shadow-lift);
		border: 1px solid var(--card-border);
	}
	@media (min-width: 640px) { .booking-form { padding: 38px; } }
	.form-grid { display: grid; gap: 16px; grid-template-columns: 1fr; }
	@media (min-width: 640px) { .form-grid { grid-template-columns: 1fr 1fr; } }
	.form-field { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
	.form-field.full { grid-column: 1 / -1; }
	.form-field label {
		font-family: var(--font-display); font-size: 12px; font-weight: 600; letter-spacing: 0.04em;
		color: var(--heading); text-transform: uppercase;
	}
	.form-field input, .form-field select, .form-field textarea {
		border: 1.5px solid var(--line); border-radius: 10px; padding: 12px 14px; font-family: var(--font-body);
		font-size: 14.5px; color: var(--text); background: var(--alt-bg); width: 100%;
		transition: border-color 0.2s ease, background 0.2s ease;
	}
	.form-field input:focus, .form-field select:focus, .form-field textarea:focus {
		border-color: var(--green); background: var(--card-bg); outline: 2px solid var(--gold); outline-offset: 1px;
	}
	.form-field textarea { resize: vertical; min-height: 90px; }
	.submit-row { margin-top: 20px; display: flex; }
	.submit-row :global(.ttg-btn) { flex: 1; }
	.form-note { font-size: 12px; color: var(--text-muted); margin-top: 14px; line-height: 1.6; }
	.form-success {
		display: flex; align-items: flex-start; gap: 12px; background: var(--tint-green); border: 1px solid var(--tint-green-line);
		border-radius: 12px; padding: 16px 18px; margin-top: 16px; font-size: 13.5px; color: var(--text); line-height: 1.6;
	}
	.form-success[hidden] { display: none; }
	.form-success svg { width: 20px; height: 20px; stroke: var(--icon-stroke); flex-shrink: 0; margin-top: 1px; }
</style>
