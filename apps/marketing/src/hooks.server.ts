import type { Handle } from '@sveltejs/kit/hooks';

/**
 * Prerender-time hook: preload the Latin fonts the first screen uses (body Inter, and Poppins 600 and 700 for
 * headings and buttons) so they download with the stylesheet, not after it is parsed. Other subsets and weights
 * load on demand.
 */
const preloadFont = (path: string) => /(inter-latin-wght|poppins-latin-(600|700))-normal\.[\w-]+\.woff2$/.test(path);

export const handle: Handle = ({ event, resolve }) =>
	resolve(event, { preload: ({ type, path }) => type === 'js' || type === 'css' || (type === 'font' && preloadFont(path)) });
