/**
 * Health check for Coolify. Internal only: the container publishes no port, so this is reachable
 * only from inside the Docker network (spec: "worker has no public port").
 */
export interface Health {
	/** Set once the queue has started and the handlers are registered. */
	ready: boolean;
}

export const healthResponse = (health: Health, method = 'GET', pathname = '/healthz'): Response => {
	if (pathname !== '/healthz' || (method !== 'GET' && method !== 'HEAD')) return new Response('not found', { status: 404 });
	return new Response(JSON.stringify({ status: health.ready ? 'ok' : 'starting' }), {
		status: health.ready ? 200 : 503,
		headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
	});
};
