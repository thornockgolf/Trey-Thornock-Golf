import type { RequestHandler } from './$types';

const MAX_BYTES = 4 * 1024;

/**
 * The browser reports a diagnostic it can't show anywhere we can read (e.g. why fullscreen failed on a
 * phone). Signed-in users only (hooks); the body is capped, logged as one line to stdout and never stored.
 */
export const POST: RequestHandler = async ({ request }) => {
	const text = (await request.text().catch(() => '')).slice(0, MAX_BYTES);
	console.warn('client log', text.replace(/\s+/g, ' '), 'ua=', (request.headers.get('user-agent') ?? '').slice(0, 160));
	return new Response(null, { status: 204 });
};
