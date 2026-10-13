import { describe, expect, it, vi } from 'vitest';
import { createLimiter, isExempt, rateLimit, rules } from './rate-limit';
import { fakeEvent } from './test-utils';

const ruleFor = (method: string, path: string) => rules.find((r) => r.match(method, path))!.name;

describe('rule matching', () => {
	it.each([
		['POST', '/api/videos', 'costly'],
		['POST', '/api/videos/abc/upload-url', 'costly'],
		['POST', '/api/billing/checkout', 'costly'],
		['POST', '/api/profile/photo', 'costly'],
		['POST', '/api/videos/abc/multipart/sign-part', 'upload-sign'],
		['GET', '/api/videos/abc/multipart/parts', 'upload-sign'],
		['POST', '/api/conversations/c1/messages', 'chat'],
		['PATCH', '/api/notifications', 'write'],
		['GET', '/api/videos', 'general'],
		['GET', '/library', 'general'],
		['POST', '/csp-report', 'csp-report'],
		['GET', '/sign-in', 'sign-in']
	])('%s %s -> %s', (m, p, name) => expect(ruleFor(m, p)).toBe(name));

	it('exempts the health check and webhooks only', () => {
		expect(isExempt('/healthz')).toBe(true);
		expect(isExempt('/webhooks/stripe')).toBe(true);
		expect(isExempt('/api/webhooks/x')).toBe(false);
	});
});

describe('limiter', () => {
	const rule = { name: 'r', limit: 2, windowMs: 1000 };

	it('allows up to the limit, then blocks with a retry time', () => {
		let t = 0;
		const l = createLimiter(() => t);
		expect(l.check(rule, 'a').allowed).toBe(true);
		expect(l.check(rule, 'a').allowed).toBe(true);
		t = 400;
		expect(l.check(rule, 'a')).toEqual({ allowed: false, retryAfterSeconds: 1 });
	});

	it('resets after the window and counts callers and rules separately', () => {
		let t = 0;
		const l = createLimiter(() => t);
		l.check(rule, 'a');
		l.check(rule, 'a');
		expect(l.check(rule, 'b').allowed).toBe(true);
		expect(l.check({ ...rule, name: 'other' }, 'a').allowed).toBe(true);
		t = 1000;
		expect(l.check(rule, 'a').allowed).toBe(true);
	});

	it('drops expired entries instead of growing forever', () => {
		let t = 0;
		const l = createLimiter(() => t);
		for (let i = 0; i < 20_000; i++) l.check(rule, `c${i}`);
		t = 5000;
		l.check(rule, 'new');
		expect(l.size()).toBe(1);
	});
});

describe('rateLimit handle', () => {
	const eventAt = (method: string, pathname: string, userId: string | null) => {
		const e = fakeEvent({ userId }) as unknown as { url: URL; request: Request; getClientAddress: () => string };
		e.url = new URL(`http://localhost${pathname}`);
		e.request = new Request(e.url, { method });
		e.getClientAddress = () => '1.2.3.4';
		return e as never;
	};
	const ok = new Response('ok');

	it('answers API calls over the limit with 429 JSON and Retry-After', async () => {
		const handle = rateLimit(createLimiter());
		const resolve = vi.fn(async () => ok);
		for (let i = 0; i < 10; i++) await handle({ event: eventAt('POST', '/api/videos', 'u1'), resolve });
		const res = await handle({ event: eventAt('POST', '/api/videos', 'u1'), resolve });
		expect(res.status).toBe(429);
		expect(res.headers.get('retry-after')).toBeTruthy();
		expect(await res.json()).toMatchObject({ code: 'RateLimited' });
		expect(resolve).toHaveBeenCalledTimes(10);
	});

	it('keeps users apart and never limits the health check', async () => {
		const handle = rateLimit(createLimiter());
		const resolve = vi.fn(async () => ok);
		for (let i = 0; i < 10; i++) await handle({ event: eventAt('POST', '/api/videos', 'u1'), resolve });
		expect(await handle({ event: eventAt('POST', '/api/videos', 'u2'), resolve })).toBe(ok);
		for (let i = 0; i < 1000; i++) expect(await handle({ event: eventAt('GET', '/healthz', null), resolve })).toBe(ok);
	});

	it('sends pages over the limit to the error page', async () => {
		const handle = rateLimit(createLimiter());
		const resolve = vi.fn(async () => ok);
		for (let i = 0; i < 30; i++) await handle({ event: eventAt('GET', '/sign-in', null), resolve });
		await expect(handle({ event: eventAt('GET', '/sign-in', null), resolve })).rejects.toMatchObject({ status: 429 });
	});
});
