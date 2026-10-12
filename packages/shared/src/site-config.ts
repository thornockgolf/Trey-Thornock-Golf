/** Single source for contact details, URLs and app link paths. Feeds footer, JSON-LD and CTAs. */
export const siteConfig = {
	name: 'Trey Thornock Golf',
	url: 'https://treythornockgolf.com',
	phone: { display: '307-337-6345', tel: 'tel:307-337-6345', e164: '+1-307-337-6345' },
	email: 'thornockgolf@gmail.com',
	address: {
		street: '6910 Fayetteville Road',
		city: 'Durham',
		region: 'NC',
		postalCode: '27713',
		country: 'US'
	},
	areaServed: ['Durham, NC', 'Raleigh, NC', 'Cary, NC', 'Chapel Hill, NC'],
	venue: "Dick's House of Sport",
	bookingUrl:
		'https://www.dickssportinggoods.com/s/scheduling/f/6e3a2f72-e8d5-415a-b6cd-16878fd35de2?s=1607',
	mapsUrl:
		'https://maps.google.com/?q=Dick%27s+House+of+Sport+6910+Fayetteville+Road+Durham+NC+27713',
	newsletterUrl:
		'https://docs.google.com/forms/d/e/1FAIpQLSderqlC3cUmuM0m6d-Q72eyeAvgIPj-gfbXm3GKYfMVPPqcrQ/viewform',
	googleSiteVerification: 'DcSvQWM98ROPu4YPHIGfLYO4s-hTfsComvI3ysKLvNY',
	/** Paths on the app subdomain; the base URL comes from PUBLIC_APP_URL at build time. */
	appPaths: { signIn: '/sign-in', signUp: '/sign-up' }
} as const;

export type SiteConfig = typeof siteConfig;
