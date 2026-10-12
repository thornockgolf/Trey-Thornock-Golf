import adapter from '@sveltejs/adapter-node';
import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		tailwindcss(),
		// adapter-node output runs on Bun: `bun build/index.js` (svelte-adapter-bun doesn't support Kit 3)
		sveltekit({ adapter: adapter({ out: 'build' }) })
	]
});
