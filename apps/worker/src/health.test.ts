import { describe, expect, it } from 'vitest';
import { healthResponse } from './health';

describe('healthResponse', () => {
	it('is 503 until the worker is ready, then 200', async () => {
		const h = { ready: false };
		expect(healthResponse(h).status).toBe(503);
		expect(await healthResponse(h).json()).toEqual({ status: 'starting' });
		h.ready = true;
		expect(healthResponse(h).status).toBe(200);
		expect(await healthResponse(h).json()).toEqual({ status: 'ok' });
	});

	it('serves nothing else', () => {
		const h = { ready: true };
		expect(healthResponse(h, 'GET', '/').status).toBe(404);
		expect(healthResponse(h, 'GET', '/api/me').status).toBe(404);
		expect(healthResponse(h, 'POST', '/healthz').status).toBe(404);
		expect(healthResponse(h, 'HEAD', '/healthz').status).toBe(200);
	});
});
