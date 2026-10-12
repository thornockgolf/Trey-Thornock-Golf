import { dev } from '$app/env';
import { redirect } from '@sveltejs/kit';
import { sequence, type Handle } from '@sveltejs/kit/hooks';
import { withClerkHandler } from 'svelte-clerk/server';
import { coachGuard } from '#lib/server/coach-guard';
import { runRoute } from '#lib/server/runtime';

/** Reachable without a session (spec 3.B.1). Webhooks authenticate by signature instead. */
const isPublic = (pathname: string) =>
	pathname === '/healthz' ||
	pathname.startsWith('/sign-in') ||
	pathname.startsWith('/sign-up') ||
	pathname.startsWith('/webhooks/') ||
	// dev-only previews (their load functions 404 in production builds)
	(dev && pathname.startsWith('/dev/'));

const requireSession: Handle = async ({ event, resolve }) => {
	if (!isPublic(event.url.pathname) && !event.locals.auth().userId) {
		// API routes get 401; pages redirect to sign-in
		if (event.url.pathname.startsWith('/api/')) {
			return new Response(JSON.stringify({ code: 'NotAuthenticated', message: 'Sign in required' }), {
				status: 401,
				headers: { 'content-type': 'application/json' }
			});
		}
		redirect(303, '/sign-in');
	}
	return resolve(event);
};

export const handle = sequence(withClerkHandler(), requireSession, coachGuard(runRoute));
