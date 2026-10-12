<script lang="ts">
	import { siteConfig } from '@ttg/shared';

	let {
		title,
		description,
		path,
		jsonLdDescription,
		image = '/images/img-02.jpg'
	}: { title: string; description: string; path: string; jsonLdDescription: string; image?: string } = $props();

	const url = $derived(`${siteConfig.url}${path}`);
	const jsonLd = $derived(
		JSON.stringify({
			'@context': 'https://schema.org',
			'@type': 'LocalBusiness',
			name: siteConfig.name,
			description: jsonLdDescription,
			url,
			telephone: siteConfig.phone.e164,
			email: siteConfig.email,
			address: {
				'@type': 'PostalAddress',
				streetAddress: siteConfig.address.street,
				addressLocality: siteConfig.address.city,
				addressRegion: siteConfig.address.region,
				postalCode: siteConfig.address.postalCode,
				addressCountry: siteConfig.address.country
			},
			areaServed: siteConfig.areaServed
		})
	);
</script>

<svelte:head>
	<title>{title}</title>
	<meta name="description" content={description} />
	<link rel="canonical" href={url} />
	<meta property="og:type" content="website" />
	<meta property="og:site_name" content={siteConfig.name} />
	<meta property="og:title" content={title} />
	<meta property="og:description" content={description} />
	<meta property="og:url" content={url} />
	<meta property="og:image" content={`${siteConfig.url}${image}`} />
	<meta name="twitter:card" content="summary_large_image" />
	{@html `<script type="application/ld+json">${jsonLd}</script>`}
</svelte:head>
