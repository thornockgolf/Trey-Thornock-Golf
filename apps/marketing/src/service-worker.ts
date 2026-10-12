/// <reference lib="webworker" />
/// <reference types="@sveltejs/kit" />

// Spec 3.A.2. Strategy:
//  - HTML navigations: network-first, fall back to the cached copy, then to /offline.
//  - Hashed build assets (immutable), fonts, images: cache-first.
//  - Everything else (cross-origin, non-GET, range requests, the manifest) is not intercepted.
// Caches are versioned by the build (`version`); old ones are deleted on activate.

import { dev, version } from '$app/env';
import { assets, immutable, prerendered } from '$app/manifest';
import { resolve } from '$app/paths';

const sw = self as unknown as ServiceWorkerGlobalScope;

const PREFIX = 'ttg-';
const STATIC_CACHE = `${PREFIX}static-${version}`;
const PAGES_CACHE = `${PREFIX}pages-${version}`;
const MEDIA_CACHE = `${PREFIX}media-${version}`;
const CURRENT_CACHES = [STATIC_CACHE, PAGES_CACHE, MEDIA_CACHE];
const MAX_MEDIA_ENTRIES = 80;
const OFFLINE_URL = resolve('/offline');

// Manifest paths have no leading slash (and the home page is ''), so normalise before resolving.
// `resolve` only types known route ids, so it is widened to a plain string function here.
const toUrl = (path: string) => (resolve as (pathname: string) => string)(`/${path.replace(/^\//, '')}`);

// Precache the shell: JS/CSS and the Latin WOFF2 fonts (other font subsets and the legacy WOFF
// fallbacks are cached on first use by the font rule below), the icons and manifest, the home
// page and /offline.
const isShellAsset = (path: string) =>
	/\.(js|css)$/.test(path) || (/-latin-[^/]*\.woff2$/.test(path) && !path.includes('-latin-ext-'));
const isShellStatic = (path: string) =>
	path.startsWith('icons/') || path === 'manifest.webmanifest' || path === 'favicon.ico';
const precacheUrls = [
	...immutable.map((entry) => entry.path).filter(isShellAsset),
	...assets.map((entry) => entry.path as string).filter(isShellStatic),
	...prerendered.map((entry) => entry.path as string).filter((path) => path === '' || path === 'offline')
].map(toUrl);
const immutableUrls = new Set<string>(immutable.map((entry) => toUrl(entry.path)));

sw.addEventListener('install', (event) => {
	if (dev) {
		void sw.skipWaiting();
		return;
	}
	event.waitUntil(
		(async () => {
			const cache = await caches.open(STATIC_CACHE);
			await cache.addAll([...new Set([...precacheUrls, OFFLINE_URL])]);
			await sw.skipWaiting();
		})()
	);
});

sw.addEventListener('activate', (event) => {
	event.waitUntil(
		(async () => {
			const keys = await caches.keys();
			await Promise.all(
				keys
					.filter((key) => key.startsWith(PREFIX) && (dev || !CURRENT_CACHES.includes(key)))
					.map((key) => caches.delete(key))
			);
			if (dev) {
				// Dev must not be controlled by a service worker: stale caches hide edits.
				await sw.registration.unregister();
				return;
			}
			await sw.clients.claim();
		})()
	);
});

async function trim(cache: Cache, max: number) {
	const keys = await cache.keys();
	for (const request of keys.slice(0, Math.max(0, keys.length - max))) await cache.delete(request);
}

async function navigate(request: Request): Promise<Response> {
	try {
		const response = await fetch(request);
		if (response.ok) {
			const cache = await caches.open(PAGES_CACHE);
			await cache.put(request, response.clone());
		}
		return response;
	} catch {
		const cached = await caches.match(request, { ignoreSearch: true, ignoreVary: true });
		if (cached) return cached;
		// Redirect rather than serve offline.html at the requested URL: the client router would
		// hydrate it as the wrong route and fail to load that route's chunks.
		return (await caches.match(OFFLINE_URL)) ? Response.redirect(OFFLINE_URL, 302) : Response.error();
	}
}

async function cacheFirst(request: Request, cacheName: string): Promise<Response> {
	// ignoreVary: module scripts send an Origin header that precache requests lack (Vary: Origin).
	const cache = await caches.open(cacheName);
	const cached = (await caches.match(request, { ignoreVary: true }));
	if (cached) return cached;
	const response = await fetch(request);
	// Only cache complete, same-origin successes (never 206 partials or opaque responses).
	if (response.status === 200 && response.type === 'basic') {
		await cache.put(request, response.clone());
		if (cacheName === MEDIA_CACHE) await trim(cache, MAX_MEDIA_ENTRIES);
	}
	return response;
}

sw.addEventListener('fetch', (event) => {
	if (dev) return;
	const { request } = event;
	if (request.method !== 'GET' || request.headers.has('range')) return;

	const url = new URL(request.url);
	// Never touch cross-origin traffic: Dick's scheduling, Google Maps/Forms, app.treythornockgolf.com.
	if (url.origin !== sw.location.origin) return;

	if (request.mode === 'navigate') {
		event.respondWith(navigate(request));
		return;
	}

	if (immutableUrls.has(url.pathname)) {
		event.respondWith(cacheFirst(request, STATIC_CACHE));
		return;
	}

	switch (request.destination) {
		case 'font':
			event.respondWith(cacheFirst(request, STATIC_CACHE));
			break;
		case 'image':
			event.respondWith(cacheFirst(request, MEDIA_CACHE));
			break;
	}
});
