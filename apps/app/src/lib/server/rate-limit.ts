import { error } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import type { Handle } from '@sveltejs/kit/hooks';

/** One rule: at most `limit` requests per `windowMs` for each caller (signed-in user, else IP). */
export type Rule = { name: string; limit: number; windowMs: number; match: (method: string, pathname: string) => boolean };

const MINUTE = 60_000;
const isRead = (method: string) => method === 'GET' || method === 'HEAD';

/**
 * First match wins. Expensive or abuse-prone routes come first with tight limits; the last rule is a
 * generous catch-all. Large uploads sign one URL per part, so multipart signing has its own roomy rule.
 */
export const rules: Rule[] = [
	{
		name: 'upload-sign',
		limit: 600,
		windowMs: MINUTE,
		match: (m, p) => /^\/api\/videos\/[^/]+\/multipart\//.test(p)
	},
	{
		name: 'costly',
		limit: 10,
		windowMs: MINUTE,
		match: (m, p) =>
			(m === 'POST' && (p === '/api/videos' || /^\/api\/videos\/[^/]+\/(upload-url|complete)$/.test(p))) ||
			(m === 'POST' && (p.startsWith('/api/profile/photo') || p.startsWith('/api/billing/')))
	},
	{
		name: 'chat',
		limit: 30,
		windowMs: MINUTE,
		match: (m, p) => m === 'POST' && /^\/api\/conversations\/[^/]+\/messages$/.test(p)
	},
	{ name: 'write', limit: 90, windowMs: MINUTE, match: (m, p) => p.startsWith('/api/') && !isRead(m) },
	{ name: 'csp-report', limit: 20, windowMs: MINUTE, match: (_m, p) => p === '/csp-report' },
	{ name: 'sign-in', limit: 30, windowMs: MINUTE, match: (_m, p) => p.startsWith('/sign-in') || p.startsWith('/sign-up') },
	{ name: 'general', limit: 600, windowMs: MINUTE, match: () => true }
];

/** Never limited: Coolify's health check, and Stripe, which authenticates by signature. */
export const isExempt = (pathname: string) => pathname === '/healthz' || pathname.startsWith('/webhooks/');

export type Decision = { allowed: true } | { allowed: false; retryAfterSeconds: number };

const MAX_ENTRIES = 20_000;

/** Fixed-window counters held in memory: fine for one app instance, reset on restart. */
export const createLimiter = (now: () => number = Date.now) => {
	const hits = new Map<string, { count: number; resetAt: number }>();

	const sweep = () => {
		const t = now();
		for (const [k, v] of hits) if (v.resetAt <= t) hits.delete(k);
	};

	return {
		size: () => hits.size,
		check(rule: Pick<Rule, 'name' | 'limit' | 'windowMs'>, caller: string): Decision {
			const t = now();
			const key = `${rule.name}|${caller}`;
			let entry = hits.get(key);
			if (!entry || entry.resetAt <= t) {
				if (hits.size >= MAX_ENTRIES) sweep();
				entry = { count: 0, resetAt: t + rule.windowMs };
				hits.set(key, entry);
			}
			entry.count += 1;
			if (entry.count > rule.limit) return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - t) / 1000)) };
			return { allowed: true };
		}
	};
};

const callerOf = (event: RequestEvent) => {
	const userId = event.locals.auth().userId;
	if (userId) return `user:${userId}`;
	try {
		return `ip:${event.getClientAddress()}`;
	} catch {
		return 'ip:unknown';
	}
};

/**
 * Over the limit: API calls get 429 JSON like every other error, pages get the error page. Runs after the
 * Clerk handler (so signed-in callers are counted per user) and before the session guard (so anonymous
 * floods are counted per IP). Behind Coolify's proxy set `ADDRESS_HEADER=x-forwarded-for` (docs/deploy.md),
 * otherwise every anonymous caller shares the proxy's address.
 */
export const rateLimit =
	(limiter = createLimiter()): Handle =>
	async ({ event, resolve }) => {
		const { pathname } = event.url;
		if (isExempt(pathname)) return resolve(event);
		const rule = rules.find((r) => r.match(event.request.method, pathname))!;
		const decision = limiter.check(rule, callerOf(event));
		if (decision.allowed) return resolve(event);

		const retryAfter = String(decision.retryAfterSeconds);
		if (pathname.startsWith('/api/')) {
			return new Response(JSON.stringify({ code: 'RateLimited', message: 'Too many requests, slow down and try again shortly' }), {
				status: 429,
				headers: { 'content-type': 'application/json', 'retry-after': retryAfter }
			});
		}
		error(429, 'Too many requests, please wait a moment and try again');
	};
