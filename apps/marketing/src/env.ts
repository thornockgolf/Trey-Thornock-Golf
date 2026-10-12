import { defineEnvVars } from '@sveltejs/kit/env';

// Sign In / Get Started links (spec 3.A.4). Values are inlined at build time; both are optional.
export const variables = defineEnvVars({
	PUBLIC_APP_URL: {
		public: true,
		static: true,
		schema: (value) => value || undefined,
		description: 'Origin of the app, e.g. https://app.treythornockgolf.com'
	},
	PUBLIC_SHOW_APP_LINKS: {
		public: true,
		static: true,
		schema: (value) => value === 'true',
		description: 'Render Sign In / Get Started only when "true"'
	}
});
