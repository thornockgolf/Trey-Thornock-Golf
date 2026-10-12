import adapter from '@sveltejs/adapter-node';
import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig(({ command }) => ({
	plugins: [
		tailwindcss(),
		// adapter-node output runs on Bun: `bun build/index.js` (svelte-adapter-bun doesn't support Kit 3)
		// .env lives at the repo root (gitignored); names are listed in the root .env.example
		sveltekit({
			adapter: adapter({ out: 'build' }),
			env: { dir: '../..' },
			// register the service worker in production builds only
			serviceWorker: { register: command === 'build' }
		})
	]
}));
