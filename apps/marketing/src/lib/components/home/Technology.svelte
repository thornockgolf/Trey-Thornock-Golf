<script lang="ts">
	import { reveal } from '#lib/actions/reveal';
	import TagPills from './TagPills.svelte';
	import { technologyTags } from '#lib/content/home-lists';
</script>

<section class="section-pad technology" id="technology">
	<div class="wrap">
		<div class="section-head" use:reveal>
			<div class="eyebrow">TrackMan &amp; Data</div>
			<h2>Technology With a Purpose</h2>
			<p>TrackMan provides the data. Coaching determines what to do with it. Technology isn’t used simply to collect numbers — it’s used to make better coaching decisions.</p>
		</div>
		<TagPills tags={technologyTags} center />
	</div>
</section>

<style>
	.technology { background: var(--alt-bg); }
</style>
