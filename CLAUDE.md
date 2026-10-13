# Trey Thornock Golf

Marketing site plus a golf video-analysis and coaching app for Trey Thornock (PGA coach, Durham NC). Domain: `treythornockgolf.com`.

## Current state

A Bun-workspaces monorepo. The marketing site is ported (`apps/marketing`). The app foundation is built (`apps/app`: Clerk sign-in, role guard, app shell, PWA; Postgres schema and migrations; R2 and queue services; Dockerfiles) and the video pipeline is built (Part C: upload API and Uppy uploader, ffmpeg worker, library, playback and download endpoints, and the video.js player page `/videos/:id`), and Part D slices 1-3 (annotations: API, Fabric-rendered canvas, coach drawing, read-only player view; reference library: coach upload, `GET /api/references`, `/coach/library`; `/compare` with side-by-side and overlay, synced from sync points, plus `POST /api/analyses` and the overlay endpoints). Part D slices 4-5 (analysis recording: segments API with partial re-record, `analysis.segment.uploaded` worker, undo, manifest, 30-day retention, the `/coach/videos/:id/analyze` recorder, and the coach's commentary playing with the video). Part D's feature list is built; not yet tried with a real microphone or on real devices. Part F is built too: the intake questionnaire, drill library and practice plans (composer at `/coach/plans`, assignment, the player's `/plans`), the coach dashboard and player page with private notes, check-ins, tests with trends, the calendar, and the player profile with a photo. Part E is built too: chat (`/messages`), the notification bell and unread badges, video Realtime events, Stripe payments (`/billing`, `/webhooks/stripe`; a paid assessment pairs the player with the coach) and the payment gates. Realtime has only been tested with stand-ins (never a real Supabase), Stripe only with the test account (no registered webhook endpoint yet). Not built yet: web push, the self-serve plan generator (deferred), `analysis.assemble`, Clerk name sync, and any deploy to the VPS. Part F has only been driven in a desktop browser against mock APIs and tested on a real database, not on a real signed-in session or phone. **What exists, in detail, is in `docs/system/`**; check it and the code before assuming something is or isn't built.

- `legacy/`: the original HTML and `images/`, kept until the marketing cutover is verified. On `main`/`origin` these are still at the repo root and Netlify deploys them from `main`.
- Layout: `apps/marketing`, `apps/app`, `apps/worker`, `packages/ui`, `packages/shared`, `packages/db`.

## Docs and who owns them

All docs live in `docs/`; only `README.md` and this file stay at the repo root. Run `/update-docs` after significant changes. `/update-docs` covers `README.md`, `docs/ARCHITECTURE.md`, `docs/system/` and the style guide; **this file is maintained by hand**, so update it whenever a rule or gotcha below changes.

| File | Role | Edit? |
|---|---|---|
| `docs/roadmap.md` | Trey's feature list and decisions, in his voice | Only if asked. Report contradictions instead. |
| `docs/checklist.md` | Trey's execution checklist (accounts, infra, notes) | Maintain it: tick items as they're done (Trey's instruction, 2026-10-12). Don't rewrite his wording or tick items that need his accounts. |
| `docs/app_spec.md` | Combined MVP spec (Parts A-F), the source of truth for what to build | Edit when the design changes or the build diverges. |
| `docs/work_plan.md` | Phased build plan generated from the spec | Tick items as they're built; update alongside the spec. |
| `docs/style-guide.md` | Design system: tokens, Skeleton theme, components | Edit when the design changes; `packages/ui` must match it. |
| `docs/ARCHITECTURE.md` | Target system diagram and data flows (keep the mermaid valid) | Update when real components diverge. |
| `docs/system/` | Current-state reference: architecture, schema, routes, jobs, integrations | Keep true to the code; `database-schema.md` is generated from the migrated database. |
| `docs/deploy.md` | Coolify settings, env var names, local image commands | Update when deploy config changes. |
| `README.md` | How to run, test and deploy | Update when commands or layout change. |

## Stack (decided, don't re-litigate)

SvelteKit (PWA) · Bun · TypeScript (strict) · Effect · Skeleton UI · Clerk (auth) · self-hosted Supabase (Postgres + Realtime) · Cloudflare R2 · Uppy.js · video.js · Fabric.js · pg-boss + ffmpeg worker · Stripe. Resolved versions are in `docs/system/architecture.md`.

- Marketing: `adapter-static` on Netlify. App and worker: `@sveltejs/adapter-node` output run with Bun (`svelte-adapter-bun` doesn't support Kit 3), separate Docker images, Hostinger KVM 4 VPS via Coolify, `app.treythornockgolf.com`.
- Use only Bun (`bun.lock`), never npm, pnpm or yarn. Install the latest stable versions and check the current docs; the spec pins none.

## Conventions that matter

- **Annotations are JSON** (our own normalized shape format + millisecond timestamps, `packages/shared/src/annotations.ts`; Fabric only renders) in Postgres, never burned into video. Coach partial re-record depends on this. Video time is integer milliseconds from the start of the processed timeline.
- **Video files never go in the database.** Browsers upload straight to R2 with presigned URLs; Postgres holds only metadata. Keep the original source files (pose estimation, post-MVP, needs them).
- **Authorization lives in the app server**, not Postgres: `currentUser`, `requireRole`, and the `coachGuard` for `/coach`. Coach-only API handlers outside `/coach` must call `requireRole('coach')` themselves. The one exception is Realtime channel auth.
- **Effect v4** (not v3): services are `Context.Service` with a `layer`; errors are `Schema.TaggedError`. Every handler goes through `runRoute` (`+server.ts`) or `runLoad` (loads) in `#lib/server/runtime`, which map tagged errors to `{ code, message }`. Request bodies are decoded with Effect `Schema` from `packages/shared`. `DatabaseError`, `QueueError` and `StorageError` details are logged, never sent to clients. The installed `effect` package ships docs in its `ai-docs/` folder.
- **Database**: plain SQL, forward-only migrations in `packages/db/migrations` (never edit an applied file; a checksum fails the run). Tables live in the `app` schema, not `public`. FKs are RESTRICT. New tables get `id`, `created_at`, `updated_at` and the `set_updated_at` trigger.
- **Jobs**: definitions in `packages/shared/src/jobs.ts`; entity queues use pg-boss's `exclusive` policy (one queued-or-active job per entity).
- **R2 keys** come only from `keys.*` in `packages/shared` (UUID-checked). The AWS SDK's default checksums must stay off (`WHEN_REQUIRED`) or presigned browser PUTs break.
- **Skeleton UI / design**: theme and tokens are defined once in `packages/ui` (green `#0B4F3A`, navy `#0E2B5C`, gold `#D4A017`; Poppins and Inter). Prefer Skeleton components. Skeleton colour pairings only combine shades that sum to 1000 (`surface-200-800` is valid, `surface-50-900` is not; use `surface-raised`). Skeleton ships `.btn` and `preset-*` in the `utilities` layer, so brand overrides go there. Never use Skeleton class names (`btn`, `card`, `chip`, ...) for custom marketing markup.
- **Dark mode** follows the OS; use tokens (`light-dark()`), not raw hex.
- **PWA**: the app service worker caches only the static shell, never pages, `/api`, media or cross-origin traffic. The marketing worker caches pages.
- **Payments**: payment state is written only by `POST /webhooks/stripe` (`applyStripeEvent`, once per event id in one transaction). Verify signatures with `constructEventAsync`: the sync `constructEvent` throws under Bun and would make every webhook a 400. `entitlementsFor` (`packages/shared`) decides what a player may use; gate with `requireAssessment` / `requireMembership` (402 with `billingUrl`). Suites about other features use `autoPay`/`grantAccess` from `test-utils.ts`.
- **Hardening**: `rateLimit` (`rate-limit.ts`, in-memory, in `hooks.server.ts` after Clerk) limits per user or IP and exempts `/healthz` and `/webhooks/*`; behind Coolify it needs `ADDRESS_HEADER=x-forwarded-for`. The CSP in `apps/app/csp.ts` is report-only (reports log from `/csp-report`); a new third-party origin (script, API, media, socket) must be added there, and enforcing it waits for a check on a real signed-in session.
- **Realtime** is a nudge, never the source of truth: write to Postgres, then `Realtime.publish` (best effort); clients catch up by `seq` cursor and poll when the socket is down. It is optional config (`PUBLIC_SUPABASE_URL` etc.); the channel policy comes from migration 0010 (`app.install_realtime_policies()`).
- Cover only 1:1 coaching for the first release (the intake-plan-only service is deferred).

## Kit 3 and tooling gotchas

- Config goes in `sveltekit({...})` in `vite.config.ts` (no `svelte.config.js`, no `kit:` namespace); tsconfig extends `$app/tsconfig`; `$lib` is gone, use `#lib/*` (package.json `imports` + tsconfig `paths`); rest routes are `[...rest]`; `Handle` comes from `@sveltejs/kit/hooks`; env vars are declared in `src/env.ts` and the root `.env` is read via `env.dir`.
- TypeScript must stay on 6.x (Kit peers `^6`; 7.x has no JS API).
- `svelte-clerk` (unofficial) peers on Kit 2 but runs on Kit 3; it logs `$env/dynamic` deprecation warnings. Re-test it after Kit upgrades.
- pg-boss needs `@opentelemetry/api` installed in `apps/app` and `packages/db`.
- `bun run --filter` doesn't put binaries on PATH: scripts call `bunx ...`.
- Never `pkill -f` a pattern that appears in your own shell command; kill by port instead.

## Secrets and git

- `.env` is gitignored and holds real keys. Never print, commit or copy its values; list names only. Keep `.env.example` as the tracked template. Production values live in Coolify, not in files; don't create `.env.production`.
- The repo is **public** on GitHub (`thornockgolf/Trey-Thornock-Golf`, owned by Trey, push access only). **Never push to `main`**: Netlify deploys the live site from it. Push other branches only when Trey asks. Don't push the monorepo to Trey's repo's `main` until the GitHub org exists and `origin` is repointed (see `docs/checklist.md`).
- Branches: `video-analysis` is the current working branch and holds Parts C, D and F (built on `video-pipeline` and `app-foundation`). Migrations 0007-0009 are Part F's. The merged branches (`video-pipeline`, `app-foundation`, `monorepo-restructure`, `monorepo-spec`) were deleted locally and on `origin` on 2026-10-13; `video-analysis` is pushed. Main branch: `main`.

## Commands

From the repo root (Bun only):

- `bun install`; `docker compose up -d db` (local Postgres, port 54322, matches the VPS image); `bun run db:migrate`.
- `bun run dev` (marketing), `bun run dev:app` (app), `bun run --filter @ttg/worker dev` (worker).
- `bun run build`, `bun run check` (typecheck), `bun run test` (Vitest in app, db, shared, ui, worker; db tests need the local container).
- Images: `docker build -f apps/app/Dockerfile -t ttg-app .` and `apps/worker/Dockerfile` (see `docs/deploy.md`).

## Project skills (`.claude/skills/`)

`/generate-app-spec`, `/generate-roadmap` (writes `docs/work_plan.md`), `/enhance-user-prompt`, `/enhance-task-description`, `/generate-tests` (Vitest, Testing Library, Playwright), `/update-docs`. Prefer these over the global equivalents of the same name.
