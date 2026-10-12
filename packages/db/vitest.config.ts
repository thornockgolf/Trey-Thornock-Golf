import { defineConfig } from 'vitest/config';

// Integration tests need the local Postgres: `docker compose up -d db` (host port 54322).
export default defineConfig({ test: { environment: 'node', include: ['src/**/*.test.ts'], testTimeout: 30_000 } });
