import { defineEnvVars } from '@sveltejs/kit/env';

// Declared for Kit 3's env system. Values come from the repo-root .env (dev) or the Coolify environment.
export const variables = defineEnvVars({
	PUBLIC_CLERK_PUBLISHABLE_KEY: { public: true, description: 'Clerk publishable key (browser-visible)' },
	CLERK_SECRET_KEY: { description: 'Clerk secret key (server only)' },
	DATABASE_URL: { description: 'Postgres connection string (server only)' },
	COACH_CLERK_USER_IDS: {
		schema: (value) => value || undefined,
		description: 'Comma-separated Clerk user IDs that are coaches; optional'
	}
});
