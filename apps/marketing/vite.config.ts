import adapter from '@sveltejs/adapter-static';
import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig(({ command }) => ({
	plugins: [
		tailwindcss(),
		sveltekit({
			adapter: adapter({ pages: 'build', assets: 'build', precompress: false, strict: true }),
			// register the service worker in production builds only
			serviceWorker: { register: command === 'build' },
			// per-page hashes for SvelteKit's inline bootstrap script (emitted as a <meta> CSP)
			csp: { mode: 'hash', directives: { 'script-src': ['self'] } },
			prerender: {
				handleHttpError: 'fail',
				handleMissingId: 'fail',
				handleUnseenRoutes: 'fail'
			}
		})
	]
}));
