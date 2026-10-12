# Integrations

Env var **names** only; values live in `.env` (gitignored, local) and Coolify (production). Template: `.env.example`. Declared for SvelteKit in `apps/app/src/env.ts` and `apps/marketing/src/env.ts`.

| Integration | Used by | Env vars | Notes |
|---|---|---|---|
| **Clerk** (hosted) | `apps/app` | `PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `COACH_CLERK_USER_IDS` | `svelte-clerk` 1.2.0 (unofficial, peers on Kit 2 but runs on Kit 3). Dev instance locally; production instance later. Marketing loads no Clerk. |
| **Postgres** (Supabase image) | app, worker | `DATABASE_URL` | Local: `docker compose up -d db` (`supabase/postgres:15.8.1.085`, host port 54322, matches the VPS). `app` schema for tables, `pgboss` for the queue. Migrations: `bun run db:migrate`. |
| **Cloudflare R2** (S3 API) | app, worker | `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` | One private bucket; key layout `raw/ processed/ analysis/ profile/` from `keys.*` in `@ttg/shared`. Presigned PUT/multipart 15 min, GET 1 h. CORS set for `localhost:5173/5174` and `app.treythornockgolf.com` (GET, PUT, POST, HEAD; `ETag` exposed). SDK checksums disabled (`WHEN_REQUIRED`). The worker has its own `Storage` service (streamed download, multipart upload via `@aws-sdk/lib-storage`, no delete). Verified against the real bucket for presigned PUT (a wrong Content-Type is rejected), multipart with resume, HEAD, attachment GET, and the worker pipeline. The Cloudflare API token is not used by the app. |
| **Stripe** | not built | planned: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, price ids | Webhook route `/webhooks/stripe` is reserved as public in the session guard. |
| **Supabase Realtime** | not built | planned: `SUPABASE_URL`, `SUPABASE_JWT_SECRET` | |
| **Netlify** | marketing | `PUBLIC_APP_URL`, `PUBLIC_SHOW_APP_LINKS` (build-time) | `apps/marketing/netlify.toml`. Live site still deploys the original HTML from `main`; not relinked yet. |
| **Coolify** (Hostinger VPS) | app, worker | see `docs/deploy.md` | Not deployed yet; Dockerfiles tested locally. |
| **app server** | adapter-node | `ORIGIN` (production), `PORT` (default 3000), `HOST` | |
