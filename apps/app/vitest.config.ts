import { defineConfig } from 'vitest/config';

// Server-side Effect code only; no SvelteKit plugin. Modules under test must not import $app/*.
export default defineConfig({
	resolve: { alias: { '#lib': new URL('./src/lib', import.meta.url).pathname } },
	test: { environment: 'node', include: ['src/**/*.test.ts'] }
});
