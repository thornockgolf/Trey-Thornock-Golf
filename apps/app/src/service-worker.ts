/// <reference lib="webworker" />
/// <reference types="@sveltejs/kit" />

// Spec 3.B.1: shell-only caching.
//  - Precached: hashed JS/CSS, Latin fonts, icons, manifest and /offline.html. Nothing else is stored.
//  - Page navigations are network-first and are NEVER cached (signed-in pages are per user); when the
//    network fails the static /offline.html is shown.
//  - API, media, auth and cross-origin requests are not intercepted (see lib/sw-routing.ts).
// A new version waits until the user taps "Reload" in the update toast (SKIP_WAITING message);
// old caches are deleted on activate.

import { dev, version } from '$app/env';
import { assets, immutable } from '$app/manifest';
import { resolve } from '$app/paths';
import { routeRequest } from '#lib/sw-routing';

const sw = self as unknown as ServiceWorkerGlobalScope;

const PREFIX = 'ttg-app-';
const SHELL_CACHE = `${PREFIX}shell-${version}`;
const OFFLINE_URL = '/offline.html';

// Manifest paths have no leading slash; `resolve` only types known route ids, so widen it.
const toUrl = (path: string) => (resolve as (pathname: string) => string)(`/${path.replace(/^\//, '')}`);

const isShellAsset = (path: string) =>
	/\.(js|css)$/.test(path) || (/-latin-[^/]*\.woff2$/.test(path) && !path.includes('-latin-ext-'));
const isShellStatic = (path: string) =>
	path.startsWith('icons/') || path === 'manifest.webmanifest' || path === 'favicon.ico' || path === 'offline.html';

const precacheUrls = [
	...immutable.map((e) => e.path).filter(isShellAsset),
	...assets.map((e) => e.path as string).filter(isShellStatic)
].map(toUrl);
// Everything precached is served cache-first (the hashed assets also arrive via lazy imports).
const shellPaths = new Set<string>([...precacheUrls, OFFLINE_URL, ...immutable.map((e) => toUrl(e.path))]);

sw.addEventListener('install', (event) => {
	if (dev) {
		void sw.skipWaiting();
		return;
	}
	// No skipWaiting here: an updated worker waits for the user's "Reload" so a page is never
	// swapped to new code mid-use.
	event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.addAll([...new Set([...precacheUrls, OFFLINE_URL])])));
});

sw.addEventListener('message', (event) => {
	if (event.data?.type === 'SKIP_WAITING') void sw.skipWaiting();
});

sw.addEventListener('activate', (event) => {
	event.waitUntil(
		(async () => {
			const keys = await caches.keys();
			await Promise.all(keys.filter((k) => k.startsWith(PREFIX) && (dev || k !== SHELL_CACHE)).map((k) => caches.delete(k)));
			if (dev) {
				// Dev must not be controlled by a worker: stale caches hide edits.
				await sw.registration.unregister();
				return;
			}
			await sw.clients.claim();
		})()
	);
});

async function navigate(request: Request): Promise<Response> {
	try {
		return await fetch(request);
	} catch {
		// Offline: a static page with no per-user data. Serve it directly (it has no client router).
		return (await caches.match(OFFLINE_URL)) ?? Response.error();
	}
}

async function cacheFirst(request: Request): Promise<Response> {
	// ignoreVary: module scripts send an Origin header that precache requests lack (Vary: Origin).
	const cached = await caches.match(request, { ignoreVary: true });
	if (cached) return cached;
	const response = await fetch(request);
	// Only complete same-origin successes are stored, never partial or opaque responses.
	if (response.status === 200 && response.type === 'basic') {
		const cache = await caches.open(SHELL_CACHE);
		await cache.put(request, response.clone());
	}
	return response;
}

sw.addEventListener('fetch', (event) => {
	if (dev) return;
	const { request } = event;
	const route = routeRequest(
		{
			method: request.method,
			url: request.url,
			mode: request.mode,
			destination: request.destination,
			hasRange: request.headers.has('range')
		},
		sw.location.origin,
		shellPaths
	);
	if (route === 'navigate') event.respondWith(navigate(request));
	else if (route === 'cache-first') event.respondWith(cacheFirst(request));
});
