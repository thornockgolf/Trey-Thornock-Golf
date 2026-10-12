# Trey Thornock Golf

Marketing site plus a golf video-analysis and coaching app for Trey Thornock (PGA coach, Durham NC). Domain: `treythornockgolf.com`.

## Current state

The repo is a Bun-workspaces monorepo (restructure done on branch `monorepo-restructure`, not pushed). Marketing is being ported from the legacy HTML into `apps/marketing`; `apps/app` is scaffolded (SvelteKit 3, adapter-node on Bun, Skeleton theme, `/healthz`); `apps/worker` and `packages/db` are placeholders.

- `legacy/`: original HTML (`index.html`, `golf-lessons-durham.html`, `index-trey-website.html`, `user-profile.html`) and `images/`, kept until cutover is verified. On `main`/`origin` these are still at the repo root and Netlify deploys them, so **do not push the restructure to `origin`** (see below).
- `apps/marketing`: SvelteKit 3 + adapter-static. `apps/app`: SvelteKit 3 + adapter-node (run on Bun). `apps/worker`: placeholder.
- `packages/ui` (`@ttg/ui`: Skeleton theme, tokens, fonts), `packages/shared` (`@ttg/shared`: `siteConfig`), `packages/db` (placeholder).
- Kit 3 specifics: config goes in `sveltekit({...})` in `vite.config.ts` (no `svelte.config.js`, no `kit:` namespace); tsconfig extends `$app/tsconfig`; TypeScript must stay on 6.x (Kit peers `^6`, TS 7 has no JS API).

## Docs and who owns them

All docs live in `docs/`; only `README.md` and this file stay at the repo root. Run `/update-docs` periodically during the build.

| File | Role | Edit? |
|---|---|---|
| `docs/roadmap.md` | Trey's feature list and decisions, in his voice | Only if asked. Report contradictions instead. |
| `docs/checklist.md` | Trey's execution checklist (accounts, infra, notes) | Maintain it: tick items as they're done (Trey's instruction, 2026-10-12). Don't rewrite his wording or tick items that need his accounts. |
| `docs/app_spec.md` | Combined MVP spec (Parts A-F), the source of truth for what to build | Edit when the design changes. |
| `docs/work_plan.md` | Phased build plan generated from the spec | Update alongside the spec. |
| `docs/style-guide.md` | Design system: tokens, Skeleton theme, components (shared by marketing and app) | Edit when the design changes; `packages/ui` must match it. |
| `docs/ARCHITECTURE.md` | System diagram and data flows (keep the mermaid valid) | Update when real components diverge. |
| `README.md` | Repo contents and deploy. Partly stale (it references `work/verify-current.js`, which isn't in the repo). | Update as the SvelteKit project lands. |

## Stack (decided, don't re-litigate)

SvelteKit (PWA) · Bun · TypeScript (strict) · Effect · Skeleton UI · Clerk (auth) · self-hosted Supabase (Postgres + Realtime) · Cloudflare R2 · Uppy.js · video.js · Fabric.js · pg-boss + ffmpeg worker · Stripe.

- Marketing (`apps/marketing`): SvelteKit with `adapter-static` on Netlify.
- App (`apps/app`) and worker (`apps/worker`): `@sveltejs/adapter-node` output run with Bun (`bun build/index.js`; `svelte-adapter-bun` doesn't support Kit 3) and a separate Docker image, on a Hostinger KVM 4 VPS orchestrated by Coolify, at `app.treythornockgolf.com`.
- Shared code lives in `packages/ui`, `packages/shared` and `packages/db`.
- Use only Bun (`bun.lock`), never npm, pnpm or yarn. Install the latest stable versions and check the current docs; the spec pins none.

## Conventions that matter

- **Annotations are JSON** (shape + millisecond timestamp) in Postgres, never burned into video. Coach partial re-record depends on this.
- **Video files never go in the database.** Browsers upload straight to R2 with presigned URLs; Postgres holds only metadata. Keep the original source files, since pose estimation (post-MVP) needs them.
- **Authorization lives in the app server**, not Postgres: resolve `CurrentUser` and `Role` (player/coach) first, then check ownership or assignment. The one exception is Realtime channel auth.
- **Effect**: each external dependency is a `Context.Tag` service with a `Layer`. Errors are tagged. Handlers go through the `runRoute` helper. Request bodies are decoded with Effect `Schema` from `packages/shared`.
- **Skeleton UI**: theme and tokens are defined once in `packages/ui`, from Trey's existing look (green `#0B4F3A`, navy `#0E2B5C`, gold `#D4A017`; Poppins and Inter; full tokens in `docs/style-guide.md`). Prefer Skeleton components over hand-rolled ones.
- Video time is integer milliseconds from the start of the processed timeline.
- Cover only 1:1 coaching for the first release (the intake-plan-only service is deferred).

## Secrets and git

- `.env` is gitignored and holds real keys. Never print, commit or copy its values. Keep `.env.example` as the tracked template.
- The repo is **public** on GitHub (`thornockgolf/Trey-Thornock-Golf`, owned by Trey, push access only). Don't push the monorepo restructure to `origin` until the GitHub org exists and `origin` is repointed (see `docs/checklist.md` notes). Commit locally or on a branch.
- Current working branch for the spec and planning work: `monorepo-spec`. Main branch: `main`.

## Project skills (`.claude/skills/`)

`/generate-app-spec`, `/generate-roadmap` (writes `docs/work_plan.md`), `/enhance-user-prompt`, `/enhance-task-description`, `/generate-tests` (Vitest, Testing Library, Playwright), `/update-docs`. Prefer these over the global equivalents of the same name.

## Commands

Run from the repo root (Bun only):

- `bun install`: install all workspaces (single `bun.lock`).
- `bun run dev`: marketing dev server. `bun run dev:app`: app dev server.
- App production: `bun run --filter @ttg/app build`, then `bun build/index.js` in `apps/app` (adapter-node on Bun; `GET /healthz` returns `{status:"ok"}`).
- `bun run build`: build every workspace (marketing output in `apps/marketing/build`).
- `bun run check`: typecheck (`svelte-check`, `tsc`) across workspaces.
- `bun run test`: no tests yet.
- Local Postgres: `docker compose up -d db` (supabase/postgres image, host port 54322, `DATABASE_URL` in `.env.example`). Develop locally; the VPS Supabase is the deploy target, not the dev database. The image tag matches the VPS (`supabase/postgres:15.8.1.085`, checked 2026-10-12); `POSTGRES_IMAGE` overrides it.
