<script lang="ts">
	import Seo from '#lib/components/Seo.svelte';
	import { siteConfig } from '@ttg/shared';
	const placeholderIds = ['assessment', 'coaching-built-around-you', 'who-i-coach', 'lessons', 'development', 'results', 'why-trey', 'practice-purpose', 'technology', 'club-fitting', 'junior', 'lesson-experience', 'about', 'testimonials', 'pricing', 'other-coaching', 'faq', 'book', 'locations', 'contact', 'newsletter'];
</script>

<!-- Placeholder: sections are ported in #lib/components/home/*. -->
<Seo
	title="Trey Thornock Golf | PGA Golf Lessons in Durham, NC"
	description="PGA golf lessons in Durham, NC with Trey Thornock at Dick's House of Sport — serving golfers throughout the Triangle, including Raleigh, Cary, and Chapel Hill. Junior golf and player development built around Assess, Identify, Develop, Practice, Transfer, Perform. Book a lesson today."
	path="/"
	jsonLdDescription="PGA golf lessons and player development with PGA Professional Trey Thornock at Dick's House of Sport in Durham, NC."
/>
<svelte:head><meta name="google-site-verification" content={siteConfig.googleSiteVerification} /></svelte:head>

<section id="home" class="section-pad" style="padding-top:150px">
	<div class="wrap"><h1>Trey Thornock Golf</h1></div>
</section>

{#each placeholderIds as id}<section {id}></section>{/each}
