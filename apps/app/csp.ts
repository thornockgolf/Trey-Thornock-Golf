import type { sveltekit } from '@sveltejs/kit/vite';

type Options = NonNullable<Parameters<typeof sveltekit>[0]>;
type Directives = NonNullable<NonNullable<Options['csp']>['directives']>;

/** Clerk's frontend API host is encoded in the publishable key (`pk_<env>_<base64(host$)>`). */
const clerkHost = (publishableKey: string | undefined) => {
	try {
		const host = atob(publishableKey?.split('_')[2] ?? '').replace(/\$$/, '');
		return /^[a-z0-9.-]+$/i.test(host) ? host : undefined;
	} catch {
		return undefined;
	}
};

/**
 * Content Security Policy for the app. Everything the pages load or call must be listed here:
 * Clerk (scripts, API, bot check, avatars), R2 (presigned PUT/GET for video and photos), Supabase Realtime
 * (https + wss) and Stripe (Checkout is a redirect, so only form-action matters). Scripts use nonces.
 */
export const appCsp = (env: Record<string, string | undefined>): Directives => {
	const clerk = clerkHost(env.PUBLIC_CLERK_PUBLISHABLE_KEY);
	const clerkOrigins = [...(clerk ? [`https://${clerk}`] : []), 'https://*.clerk.accounts.dev', 'https://*.clerk.com'];
	const supabase = env.PUBLIC_SUPABASE_URL ? new URL(env.PUBLIC_SUPABASE_URL) : undefined;
	const supabaseOrigins = supabase ? [supabase.origin, `${supabase.protocol === 'https:' ? 'wss' : 'ws'}://${supabase.host}`] : [];
	const r2 = ['https://*.r2.cloudflarestorage.com'];

	// Origins are built at runtime, so they can't satisfy Kit's literal Source types.
	const directives: Record<string, string[]> = {
		'default-src': ['self'],
		'script-src': ['self', 'wasm-unsafe-eval', ...clerkOrigins, 'https://challenges.cloudflare.com'],
		'style-src': ['self', 'unsafe-inline'],
		'img-src': ['self', 'data:', 'blob:', 'https://img.clerk.com', ...r2],
		'media-src': ['self', 'blob:', ...r2],
		'font-src': ['self'],
		'connect-src': ['self', ...clerkOrigins, ...r2, ...supabaseOrigins],
		'frame-src': ['https://challenges.cloudflare.com', ...clerkOrigins],
		'worker-src': ['self', 'blob:'],
		'manifest-src': ['self'],
		'object-src': ['none'],
		'base-uri': ['self'],
		'form-action': ['self', 'https://checkout.stripe.com', ...clerkOrigins],
		'frame-ancestors': ['none'],
		'report-uri': ['/csp-report']
	};
	return directives as unknown as Directives;
};
