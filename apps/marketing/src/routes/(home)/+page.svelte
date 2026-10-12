<script lang="ts">
	import Seo from '#lib/components/Seo.svelte';
	import { siteConfig } from '@ttg/shared';
	import Hero from '#lib/components/home/Hero.svelte';
	import Assessment from '#lib/components/home/Assessment.svelte';
	import PhilosophyStrip from '#lib/components/home/PhilosophyStrip.svelte';
	import CoachingPhilosophy from '#lib/components/home/CoachingPhilosophy.svelte';
	import WhoICoach from '#lib/components/home/WhoICoach.svelte';
	import Lessons from '#lib/components/home/Lessons.svelte';
	import Development from '#lib/components/home/Development.svelte';
	import Results from '#lib/components/home/Results.svelte';
	import WhyTrey from '#lib/components/home/WhyTrey.svelte';
	import PracticePurpose from '#lib/components/home/PracticePurpose.svelte';
	import Technology from '#lib/components/home/Technology.svelte';
	import ClubFitting from '#lib/components/home/ClubFitting.svelte';
	import Junior from '#lib/components/home/Junior.svelte';
	import LessonExperience from '#lib/components/home/LessonExperience.svelte';
	import About from '#lib/components/home/About.svelte';
	import Testimonials from '#lib/components/home/Testimonials.svelte';
	import Pricing from '#lib/components/home/Pricing.svelte';
	import OtherCoaching from '#lib/components/home/OtherCoaching.svelte';
	import Faq from '#lib/components/home/Faq.svelte';
	import Booking from '#lib/components/home/Booking.svelte';
	import Locations from '#lib/components/home/Locations.svelte';
	import Contact from '#lib/components/home/Contact.svelte';
	import Newsletter from '#lib/components/home/Newsletter.svelte';
</script>

<Seo
	title="Trey Thornock Golf | PGA Golf Lessons in Durham, NC"
	description="PGA golf lessons in Durham, NC with Trey Thornock at Dick's House of Sport — serving golfers throughout the Triangle, including Raleigh, Cary, and Chapel Hill. Junior golf and player development built around Assess, Identify, Develop, Practice, Transfer, Perform. Book a lesson today."
	path="/"
	jsonLdDescription="PGA golf lessons and player development with PGA Professional Trey Thornock at Dick's House of Sport in Durham, NC."
/>
<svelte:head><meta name="google-site-verification" content={siteConfig.googleSiteVerification} /></svelte:head>

<Hero />
<Assessment />
<PhilosophyStrip />
<CoachingPhilosophy />
<WhoICoach />
<Lessons />
<Development />
<Results />
<WhyTrey />
<PracticePurpose />
<Technology />
<ClubFitting />
<Junior />
<LessonExperience />
<About />
<Testimonials />
<Pricing />
<OtherCoaching />
<Faq />
<Booking />
<Locations />
<Contact />
<Newsletter />
