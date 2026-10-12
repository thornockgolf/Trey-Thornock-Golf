# Architecture (as built)

## Workspaces

Bun workspaces monorepo, one `bun.lock`. TypeScript strict (`tsconfig.base.json`).

| Workspace | What it is | Status |
|---|---|---|
| `apps/marketing` | SvelteKit 3, `adapter-static`, deployed to Netlify. Two route groups: `(home)` (full nav) and `(guide)` (Durham page, compact chrome). PWA with a page-caching service worker. | Built |
| `apps/app` | SvelteKit 3, `adapter-node` run with Bun, at `app.treythornockgolf.com`. Clerk sign-in, role guard, app shell, shell-only PWA. | Foundation plus video upload, library, playback and download API; player page not yet |
| `apps/worker` | Bun process: pg-boss consumer (`video.uploaded` transcode, poster, sprite), internal `/healthz`, ffmpeg in its image. | Video handler built |
| `packages/ui` (`@ttg/ui`) | Skeleton v5 `ttg` theme, tokens, base styles, Fontsource fonts. | Built |
| `packages/shared` (`@ttg/shared`) | `siteConfig`, API/error schemas, storage keys and limits, job definitions. | Built |
| `packages/db` (`@ttg/db`) | SQL migrations and runner, `Db`, `Users`, `Queue` Effect services. | Built |
| `legacy/` | Original static HTML, kept until marketing cutover is verified. | To remove after cutover |

## Versions (resolved in `bun.lock`, 2026-10-12)

Bun 1.4.2 · TypeScript 6.0.3 (Kit 3 requires 6.x; 7.x breaks it) · SvelteKit 3.0.1 · Svelte 5.57.2 · Vite 8.3.4 · Tailwind 4.3.3 · Skeleton 5.0.1 (`@skeletonlabs/skeleton`, `skeleton-svelte`) · Effect 4.0.3 · Uppy core 6.2 (custom uploader plugin; `@uppy/aws-s3` 6.x no longer fits our server-signed flow) · `svelte-clerk` 1.2.0 (unofficial) · pg 8.23.1 · pg-boss 12.37.1 · AWS SDK v3 3.1149 (`client-s3`, `s3-request-presigner`) · Vitest 5.0.4 · adapter-node 6.0.0 · adapter-static 4.0.0.

## App request lifecycle (`apps/app`)

`src/hooks.server.ts` runs, in order:

1. `withClerkHandler()` (svelte-clerk) verifies the Clerk session and sets `locals.auth()`.
2. `requireSession`: anonymous requests are redirected to `/sign-in` (pages) or get 401 JSON (`/api/*`). Public: `/healthz`, `/sign-in*`, `/sign-up*`, `/webhooks/*`, and `/dev/*` in dev only.
3. `coachGuard`: everything under `/coach` requires role `coach` (403 otherwise; a failed role lookup is denied).

Then a route runs. Server code goes through Effect:

- `runRoute(event, effect)` (in `+server.ts`) and `runLoad(event, effect)` (in `+layout.server.ts` / `+page.server.ts`) run the effect on the shared `ManagedRuntime` (`src/lib/server/runtime.ts`) and map tagged errors to `{ code, message }` with 401/403/404/409/422/402/500. Defects and `DatabaseError`/`QueueError`/`StorageError` become a generic 500 and are logged, never sent to clients.
- `currentUser` resolves the Clerk user, upserts the `users` row (new users are `player`; ids in `COACH_CLERK_USER_IDS` are `coach`) and returns `{ id, clerkUserId, role }`. `requireRole(...)` fails with `Forbidden`.
- `decodeBody(schema)` decodes a JSON body with an Effect Schema from `@ttg/shared` (422 on failure).

Effect v4 conventions: services are `Context.Service` classes with a static `layer`; errors are `Schema.TaggedError`. Live layers in `AppLayer`: `CoachAllowlist`, `Users` (over `Db`), `Queue` (producer role), `R2`. `src/lib/server/test-utils.ts` and `r2-fake.ts` provide in-memory test layers.

## Authorization

In the app server only (`currentUser`, `requireRole`, `coachGuard`), never in Postgres. Resource-level checks (ownership, coach assignment) are written per handler as features land.

## UI shell (`apps/app/src/lib`)

`AppShell.svelte`: top app bar, bottom nav below 768px, rail 768-1023px, 242px sidebar from 1024px. Nav is role-based (`nav.ts`); items are disabled until their screen exists. Signed-in pages live in the `(app)` route group, whose layout loads the current user. `OfflineBanner` plus the `online` store pause upload and messages while offline. Update toast (`pwa.ts`, `Toasts.svelte`).

## PWA

- Marketing: network-first pages, cache-first hashed assets/fonts/images, offline fallback route.
- App: precaches only the static shell; never caches pages, `/api`, media or cross-origin traffic (`sw-routing.ts`); offline navigations get `static/offline.html`; updates wait for the user's "Reload". Registered in production builds only.

## Build and run

`bun run build` builds every workspace; `apps/app` builds to `build/` and runs with `bun build/index.js`. Docker images (`apps/app/Dockerfile`, `apps/worker/Dockerfile`) build from the repo root; the app container runs migrations on start. See `docs/deploy.md`.

## Tests

Vitest in `apps/app` (Effect error mapping, auth, guards, R2 presigning offline, nav, service-worker routing and update logic), `packages/db` (migrations, constraints, `Db`, `Users`, `Videos`, `Queue` against a real Postgres and real pg-boss), `packages/shared` (keys, limits, schemas, jobs) and `apps/worker` (generated ffmpeg clips through the real pipeline with an in-memory `Storage` and a real database). The app also tests the video handlers with real Users/Videos on a throwaway database, an in-memory R2 and queue (the 403 matrix), and the upload logic and controller against a fake server. Database tests need `docker compose up -d db`. No end-to-end browser tests with a real Clerk session yet.
