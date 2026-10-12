import { describe, expect, it } from 'vitest';
import { routeRequest, type RequestInfo } from './sw-routing';

const ORIGIN = 'https://app.treythornockgolf.com';
const immutable = new Set([
	'/_app/immutable/entry/app.abc.js',
	'/_app/immutable/assets/0.def.css',
	'/icons/icon-192.png',
	'/offline.html'
]);
const req = (over: Partial<RequestInfo> & { path?: string; origin?: string }): RequestInfo => ({
	method: 'GET',
	url: `${over.origin ?? ORIGIN}${over.path ?? '/'}`,
	mode: 'cors',
	destination: '',
	hasRange: false,
	...over
});
const route = (over: Parameters<typeof req>[0]) => routeRequest(req(over), ORIGIN, immutable);

describe('routeRequest', () => {
	it('handles page navigations (network-first with the offline fallback)', () => {
		expect(route({ mode: 'navigate', path: '/' })).toBe('navigate');
		expect(route({ mode: 'navigate', path: '/coach/players/1' })).toBe('navigate');
	});

	it('serves hashed build assets and fonts from the cache', () => {
		expect(route({ path: '/_app/immutable/entry/app.abc.js', destination: 'script' })).toBe('cache-first');
		expect(route({ path: '/fonts/inter.woff2', destination: 'font' })).toBe('cache-first');
	});

	it('serves precached shell files (icons, offline page) from the cache even though images are otherwise bypassed', () => {
		expect(route({ path: '/icons/icon-192.png', destination: 'image' })).toBe('cache-first');
		expect(route({ path: '/offline.html' })).toBe('cache-first');
	});

	it('never intercepts API, webhook, health and auth requests', () => {
		for (const path of ['/api/me', '/api/videos/1/playback', '/webhooks/stripe', '/healthz', '/sign-in', '/sign-in/factor-one', '/sign-up']) {
			expect(route({ path }), path).toBe('bypass');
		}
	});

	it('never intercepts media: images and video are not cached', () => {
		expect(route({ path: '/images/img-01.png', destination: 'image' })).toBe('bypass');
		expect(route({ path: '/media/clip.mp4', destination: 'video' })).toBe('bypass');
	});

	it('never intercepts non-GET, range requests, or other origins', () => {
		expect(route({ method: 'POST', path: '/api/videos' })).toBe('bypass');
		expect(route({ method: 'PUT', origin: 'https://acct.r2.cloudflarestorage.com', path: '/b/raw/x' })).toBe('bypass');
		expect(route({ path: '/media/clip.mp4', hasRange: true, destination: 'video' })).toBe('bypass');
		expect(route({ origin: 'https://clerk.example.com', path: '/npm/clerk.js', destination: 'script' })).toBe('bypass');
		expect(route({ origin: 'https://acct.r2.cloudflarestorage.com', path: '/b/raw/x', destination: 'video' })).toBe('bypass');
		// even a navigation to another origin is not ours
		expect(route({ origin: 'https://example.com', mode: 'navigate' })).toBe('bypass');
	});

	it('does not match lookalike paths', () => {
		expect(route({ path: '/apiary', destination: 'font' })).toBe('cache-first');
	});
});
