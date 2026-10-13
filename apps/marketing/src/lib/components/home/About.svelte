<script lang="ts">
	import ResponsiveImage from '#lib/components/ResponsiveImage.svelte';
	import { reveal } from '#lib/actions/reveal';

	const credentials = [
		'PGA Member',
		'TrackMan University Level 2',
		'Mizuno and Callaway product knowledge & club fitting certification',
		'Master Club Fitter',
		'Club Repair Technician',
		'ADM Certified',
		'PGA HOPE Certified'
	];
</script>

<section class="section-pad about-section" id="about">
	<div class="wrap">
		<div class="about-grid">
			<div class="about-photo" use:reveal>
				<ResponsiveImage name="img-12" alt="Trey Thornock, PGA golf coach" sizes="(min-width: 900px) 450px, 100vw" />
			</div>
			<div class="about-copy" use:reveal>
				<div class="eyebrow">About Trey</div>
				<h2>Meet Trey</h2>
				<h4>Bio</h4>
				<p class="about-text">Trey Thornock is a PGA golf coach focused on helping golfers of all ages and skill levels improve through personalized instruction and purposeful practice. Based primarily at Dick’s House of Sport in Durham, Trey uses technology such as TrackMan, video analysis, and Vertex putting sensors to help players better understand their game and track their progress. He works with beginners, juniors, recreational golfers, and competitive players through individualized lessons and player-development programs. Trey also teaches periodically in Douglas, Wyoming, helping golfers take what they learn from practice to the course.</p>
				<h4>PGA Credentials</h4>
				<ul class="credential-list">
					{#each credentials as item (item)}
						<li>{item}</li>
					{/each}
				</ul>
				<h4>Coaching Focus</h4>
				<p class="about-text">Trey’s coaching skills include short game, putting, tournament strategy, course strategy, wedge play, full swing, wind play, and club fitting — applied through an assessment-driven approach built around Trey’s player-development pathway.</p>
			</div>
		</div>
	</div>
</section>

<style>
	.about-section { background: var(--alt-bg); }
	.about-grid { display: grid; gap: 44px; align-items: start; }
	@media (min-width: 900px) { .about-grid { grid-template-columns: 0.85fr 1.15fr; align-items: center; } }
	.about-photo { aspect-ratio: 4 / 5; border-radius: var(--radius-lg); position: relative; box-shadow: var(--shadow-lift); }
	.about-photo :global(img) {
		width: 100%; height: 100%; object-fit: cover; object-position: center 20%; display: block;
		border-radius: var(--radius-lg); position: relative; z-index: 1;
	}
	.about-copy h2 { font-size: clamp(26px, 4vw, 36px); margin-bottom: 16px; }
	.about-copy h4 {
		font-size: 12.5px; text-transform: uppercase; letter-spacing: 0.1em; color: var(--eyebrow);
		font-family: var(--font-display); font-weight: 700; margin-top: 26px;
	}
	.about-text { font-size: 14.5px; color: var(--text-muted); line-height: 1.75; }
	.credential-list { list-style: none; margin: 10px 0 0; padding: 0; display: flex; flex-direction: column; gap: 9px; }
	.credential-list li { font-size: 14px; color: var(--text-muted); display: flex; align-items: flex-start; gap: 9px; line-height: 1.55; }
	.credential-list li::before { content: ''; width: 6px; height: 6px; border-radius: 50%; background: var(--gold); margin-top: 7px; flex-shrink: 0; }
</style>
