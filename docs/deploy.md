# Deploying the app and worker (Coolify on the Hostinger VPS)

Two Coolify applications from the same repo, both built from the **repo root** (workspace packages
must be in the build context). Env var **names only** below; set values in Coolify, never in the repo.
Marketing deploys separately on Netlify (`apps/marketing/netlify.toml`).

## App: `app.treythornockgolf.com`

| Setting | Value |
|---|---|
| Build pack | Dockerfile |
| Base directory | `/` (repo root) |
| Dockerfile location | `/apps/app/Dockerfile` |
| Port | 3000 |
| Health check | `GET /healthz` (also in the image: `HEALTHCHECK`) |
| Watch paths | `apps/app/**`, `packages/**`, `package.json`, `bun.lock` |
| Domain | `https://app.treythornockgolf.com` (Coolify provisions HTTPS) |

On start the container applies database migrations (`packages/db`), then runs `bun build/index.js`.
If a migration fails the container exits, the health check never passes, and Coolify keeps the
previous container serving.

Environment variables (production values, not the dev ones):

- `ORIGIN` = `https://app.treythornockgolf.com` (adapter-node uses it for CSRF checks and absolute URLs behind the proxy)
- `DATABASE_URL` (Supabase Postgres over the internal Docker network; a server-side role, never exposed to browsers)
- `PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` (Clerk **production** instance)
- `COACH_CLERK_USER_IDS` (comma separated Clerk user IDs that are coaches)
- `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`
- Later parts: Stripe (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, price ids), Supabase Realtime (`SUPABASE_URL`, `SUPABASE_JWT_SECRET`)

Do not set the Cloudflare API token (`R2_BUCKET_TOKEN` in a dev `.env`); the app only needs the S3 key pair.

## Worker (no public port)

| Setting | Value |
|---|---|
| Build pack | Dockerfile |
| Base directory | `/` (repo root) |
| Dockerfile location | `/apps/worker/Dockerfile` |
| Ports exposed | none (publish no port, no domain) |
| Health check | from the image: `GET /healthz` on `PORT` (default 8081), reachable only inside the Docker network |
| Watch paths | `apps/worker/**`, `packages/**`, `package.json`, `bun.lock` |
| Storage | mount a size-limited volume at `/tmp/ttg-work` (`WORK_DIR`) for downloads and transcodes |

Environment variables: `DATABASE_URL`, `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`,
`R2_BUCKET` (the R2 ones are used once the transcode job lands in Part C).

The worker runs pg-boss maintenance and the schedules. It stops gracefully on SIGTERM (finishes
active jobs, up to 20 s), so give Coolify's stop timeout at least 30 s.

## Local images

```bash
docker build -f apps/app/Dockerfile -t ttg-app .
docker build -f apps/worker/Dockerfile -t ttg-worker .
docker run --rm --network host --env-file .env -e PORT=3101 ttg-app      # needs `docker compose up -d db`
docker run --rm --network host --env-file .env -e PORT=8082 ttg-worker
```

`.dockerignore` keeps `.env*`, `node_modules`, `.git` and build output out of images.

## Not yet verified on the VPS

Nothing here has been deployed. The GitHub App and the org repo (checklist) are prerequisites for
Coolify to pull the code. Re-check the Postgres image and `DATABASE_URL` host on the VPS stack.
