import adapter from '@sveltejs/adapter-node';
import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, loadEnv } from 'vite';
import { appCsp } from './csp';

export default defineConfig(({ command, mode }) => ({
	plugins: [
		tailwindcss(),
		// adapter-node output runs on Bun: `bun build/index.js` (svelte-adapter-bun doesn't support Kit 3)
		// .env lives at the repo root (gitignored); names are listed in the root .env.example
		sveltekit({
			adapter: adapter({ out: 'build' }),
			env: { dir: '../..' },
			// register the service worker in production builds only
			serviceWorker: { register: command === 'build' },
			// Report-only until the app has been used end to end with no violations in the console; then move
			// it to `directives` to enforce (see docs/deploy.md).
			csp: { mode: 'nonce', reportOnly: appCsp(loadEnv(mode, '../..', '')) }
		})
	],
	// lets cloudflared / ngrok tunnels reach the dev server (phone testing)
	server: { allowedHosts: ['.trycloudflare.com', '.ngrok-free.app', '.ngrok-free.dev'] }
}));
