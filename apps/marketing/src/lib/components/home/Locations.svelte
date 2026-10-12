<script lang="ts">
	import { siteConfig } from '@ttg/shared';
	import { reveal } from '#lib/actions/reveal';
	import Button from '#lib/components/Button.svelte';

	const wyomingMailto = `mailto:${siteConfig.email}?subject=${encodeURIComponent('Wyoming Golf Updates')}`;
</script>

<section class="section-pad locations-section" id="locations">
	<div class="wrap">
		<div class="section-head" use:reveal>
			<div class="eyebrow">Locations</div>
			<h2>Where to Find Trey</h2>
		</div>
		<div class="locations-grid" use:reveal>
			<div class="location-card">
				<span class="location-tag">Primary Location</span>
				<h3>Durham, North Carolina</h3>
				<p class="location-sub">Dick’s House of Sport — The Streets at Southpoint</p>
				<ul class="location-details">
					<li><svg viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z" /><circle cx="12" cy="10" r="3" /></svg>{siteConfig.address.street}, {siteConfig.address.city}, {siteConfig.address.region} {siteConfig.address.postalCode}</li>
					<li><svg viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 3v4M8 3v4M2 11h20" /></svg>Golf lessons, TrackMan simulator bays, and club fitting available</li>
					<li><svg viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>Lesson availability year-round</li>
				</ul>
				<div class="location-cta"><Button href={siteConfig.mapsUrl} variant="outline-dark">Get Directions</Button></div>
			</div>
			<div class="location-card">
				<span class="location-tag gold">Periodic / Seasonal</span>
				<h3>Douglas, Wyoming</h3>
				<p class="location-sub">Coaching available periodically, not year-round</p>
				<ul class="location-details">
					<li><svg viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>Individual lessons, junior golf, and on-course instruction</li>
					<li><svg viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6L9 17l-5-5" /></svg>Golf clinics and group experiences when scheduled</li>
				</ul>
				<div class="location-cta"><Button href={wyomingMailto} variant="outline-dark">Join the Wyoming Golf Updates List</Button></div>
			</div>
		</div>
	</div>
</section>

<style>
	.locations-section { background: var(--alt-bg); }
	.locations-grid { display: grid; gap: 24px; grid-template-columns: 1fr; }
	@media (min-width: 760px) { .locations-grid { grid-template-columns: 1fr 1fr; } }
	.location-card {
		background: var(--card-bg); border-radius: var(--radius-lg); padding: 32px 28px; box-shadow: var(--shadow-soft);
		border: 1px solid var(--card-border); display: flex; flex-direction: column;
	}
	.location-tag {
		align-self: flex-start; font-family: var(--font-display); font-weight: 700; font-size: 11px; letter-spacing: 0.06em;
		text-transform: uppercase; color: var(--white); background: var(--green-fill); padding: 6px 14px; border-radius: 100px; margin-bottom: 16px;
	}
	.location-tag.gold { background: var(--gold); color: var(--navy); }
	.location-card h3 { font-size: 20px; font-weight: 700; margin-bottom: 6px; }
	.location-sub { font-size: 13.5px; color: var(--text-muted); margin-bottom: 18px; }
	.location-details { list-style: none; margin: 0 0 24px; padding: 0; display: flex; flex-direction: column; gap: 12px; flex: 1; }
	.location-details li { display: flex; align-items: flex-start; gap: 10px; font-size: 14px; color: var(--text-muted); line-height: 1.5; }
	.location-details li svg { width: 18px; height: 18px; stroke: var(--icon-stroke); flex-shrink: 0; margin-top: 1px; }
	.location-cta { align-self: flex-start; }
	.location-cta :global(.ttg-btn) { white-space: normal; text-align: center; }
</style>
