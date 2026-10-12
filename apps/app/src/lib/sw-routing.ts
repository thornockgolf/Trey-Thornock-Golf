/**
 * Which requests the service worker may touch. Kept free of service-worker globals so it can be
 * unit tested. The app caches only its static shell; signed-in pages, API responses and media are
 * never cached (spec 3.B.1: "API and media responses are never cached by the service worker").
 */
export type Route = 'bypass' | 'navigate' | 'cache-first';

export interface RequestInfo {
	method: string;
	url: string;
	mode: string;
	destination: string;
	hasRange: boolean;
}

/** Paths that must always go to the network, whatever the request type. */
const NEVER_INTERCEPT = ['/api/', '/webhooks/', '/healthz', '/sign-in', '/sign-up'];

/**
 * `shellPaths` are the URLs precached at install (hashed JS/CSS, fonts, icons, manifest, offline page).
 * They are served cache-first, whatever their request type.
 */
export const routeRequest = (req: RequestInfo, origin: string, shellPaths: ReadonlySet<string>): Route => {
	if (req.method !== 'GET' || req.hasRange) return 'bypass';
	const url = new URL(req.url);
	// Clerk, Stripe, R2 presigned URLs and everything else cross-origin are never touched.
	if (url.origin !== origin) return 'bypass';
	if (req.mode === 'navigate') return 'navigate';
	if (NEVER_INTERCEPT.some((p) => url.pathname === p.replace(/\/$/, '') || url.pathname.startsWith(p))) return 'bypass';
	if (shellPaths.has(url.pathname)) return 'cache-first';
	// Fonts only. Images and video are not cached: media can be large and is per-user.
	if (req.destination === 'font') return 'cache-first';
	return 'bypass';
};
