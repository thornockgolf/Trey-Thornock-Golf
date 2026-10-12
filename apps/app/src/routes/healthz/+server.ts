import type { RequestHandler } from './$types';

// Coolify health check target. Keep it dependency-free so it reports the process is up.
export const GET: RequestHandler = () =>
	new Response(JSON.stringify({ status: 'ok' }), {
		headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
	});
