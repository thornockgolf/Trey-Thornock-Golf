import { defineEnvVars } from '@sveltejs/kit/env';

// Declared for Kit 3's env system. Values come from the repo-root .env (dev) or the Coolify environment.
export const variables = defineEnvVars({
	PUBLIC_CLERK_PUBLISHABLE_KEY: { public: true, description: 'Clerk publishable key (browser-visible)' },
	CLERK_SECRET_KEY: { description: 'Clerk secret key (server only)' },
	R2_ENDPOINT: { description: 'R2 S3 API endpoint, https://<account_id>.r2.cloudflarestorage.com' },
	R2_ACCESS_KEY_ID: { description: 'R2 S3 access key id' },
	R2_SECRET_ACCESS_KEY: { description: 'R2 S3 secret access key' },
	R2_BUCKET: { description: 'R2 bucket name (private)' },
	DATABASE_URL: { description: 'Postgres connection string (server only)' },
	COACH_CLERK_USER_IDS: {
		schema: (value) => value || undefined,
		description: 'Comma-separated Clerk user IDs that are coaches; optional'
	}
});
