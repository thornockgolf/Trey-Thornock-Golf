import { svelte } from '@sveltejs/vite-plugin-svelte';
import { svelteTesting } from '@testing-library/svelte/vite';
import { defineConfig } from 'vitest/config';

const alias = { '#lib': new URL('./src/lib', import.meta.url).pathname };

// Two projects. `server`: Effect code in node, no SvelteKit plugin (modules under test must not import $app/*).
// `components`: `*.dom.test.ts` and `*.svelte.test.ts` in jsdom; the svelte plugin compiles components and svelteTesting resolves Svelte's
// browser build (kept out of the server project, where the browser condition breaks the AWS SDK imports).
export default defineConfig({
	test: {
		projects: [
			{ resolve: { alias }, test: { name: 'server', environment: 'node', include: ['src/**/*.test.ts'], exclude: ['src/**/*.dom.test.ts', 'src/**/*.svelte.test.ts'] } },
			{ plugins: [svelte(), svelteTesting()], resolve: { alias }, test: { name: 'components', environment: 'jsdom', include: ['src/**/*.dom.test.ts', 'src/**/*.svelte.test.ts'] } }
		]
	}
});
