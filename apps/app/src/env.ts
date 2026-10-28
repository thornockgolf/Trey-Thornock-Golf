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
	// Billing and Realtime are optional so the app runs without them: billing then answers 402/503 and chat polls.
	STRIPE_SECRET_KEY: { schema: (value) => value || undefined, description: 'Stripe secret key (server only); billing is off without it' },
	STRIPE_WEBHOOK_SECRET: { schema: (value) => value || undefined, description: 'Signing secret of the /webhooks/stripe endpoint' },
	STRIPE_PRICE_ASSESSMENT: { schema: (value) => value || undefined, description: 'Stripe price id: Initial Performance Assessment, one time' },
	STRIPE_PRICE_MEMBERSHIP: { schema: (value) => value || undefined, description: 'Stripe price id: Coaching Membership, monthly' },
	PUBLIC_SUPABASE_URL: { public: true, schema: (value) => value || undefined, description: 'Self-hosted Supabase API gateway URL (Realtime)' },
	PUBLIC_SUPABASE_ANON_KEY: { public: true, schema: (value) => value || undefined, description: 'Supabase anon key (browser-visible)' },
	SUPABASE_SERVICE_ROLE_KEY: { schema: (value) => value || undefined, description: 'Supabase service role key: the app server and worker publish Realtime events with it' },
	SUPABASE_JWT_SECRET: { schema: (value) => value || undefined, description: 'Supabase JWT secret: signs the short-lived channel tokens' },
	// Web push is optional: without all three the app works and just does not send browser notifications.
	VAPID_PUBLIC_KEY: { schema: (value) => value || undefined, description: 'VAPID public key for web push (bunx web-push generate-vapid-keys); push is off without it' },
	VAPID_PRIVATE_KEY: { schema: (value) => value || undefined, description: 'VAPID private key for web push (server only)' },
	VAPID_SUBJECT: { schema: (value) => value || undefined, description: 'Contact for the push services: mailto:you@example.com or an https URL' },
	// TEMPORARY feedback tickets (docs/system/feedback.md): "true"/"false"; unset means on in dev, off in production.
	PUBLIC_FEEDBACK_ENABLED: { public: true, schema: (value) => value || undefined, description: 'Show the temporary Feedback section; unset = on in dev, off in production' },
	COACH_CLERK_USER_IDS: {
		schema: (value) => value || undefined,
		description: 'Comma-separated Clerk user IDs that are coaches; optional'
	}
});
