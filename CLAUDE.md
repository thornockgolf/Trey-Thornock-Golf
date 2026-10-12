# Trey Thornock Golf

Marketing site plus a golf video-analysis and coaching app for Trey Thornock (PGA coach, Durham NC). Domain: `treythornockgolf.com`.

## Current state

The repo is **still static HTML**; the code described in `docs/app_spec.md` doesn't exist yet. The MVP is being built as a Bun-workspaces monorepo with this repo as the root (git history kept).

- `index.html`, `golf-lessons-durham.html`: live marketing pages. Netlify deploys them from `main`, so **do not move or rename them on a branch that gets pushed to `origin`**.
- `index-trey-website.html`: practice plan generator, deployed separately (`treythornockgolfpractice.netlify.app`).
- `user-profile.html`: player profile page, an input to the app's profile feature.
- `images/`: photos used by the pages.

Not yet created: `apps/*`, `packages/*`, `legacy/`, `docs/system/`. Check the filesystem before assuming any of them exist.

## Docs and who owns them

All docs live in `docs/`; only `README.md` and this file stay at the repo root. Run `/update-docs` periodically during the build.

| File | Role | Edit? |
|---|---|---|
| `docs/roadmap.md` | Trey's feature list and decisions, in his voice | Only if asked. Report contradictions instead. |
| `docs/checklist.md` | Trey's execution checklist (accounts, infra, notes) | Don't edit; mention stale or done items in the summary. |
| `docs/app_spec.md` | Combined MVP spec (Parts A-F), the source of truth for what to build | Edit when the design changes. |
| `docs/work_plan.md` | Phased build plan generated from the spec | Update alongside the spec. |
| `docs/style-guide.md` | Design system: tokens, Skeleton theme, components (shared by marketing and app) | Edit when the design changes; `packages/ui` must match it. |
| `docs/ARCHITECTURE.md` | System diagram and data flows (keep the mermaid valid) | Update when real components diverge. |
| `README.md` | Repo contents and deploy. Partly stale (it references `work/verify-current.js`, which isn't in the repo). | Update as the SvelteKit project lands. |

## Stack (decided, don't re-litigate)

SvelteKit (PWA) · Bun · TypeScript (strict) · Effect · Skeleton UI · Clerk (auth) · self-hosted Supabase (Postgres + Realtime) · Cloudflare R2 · Uppy.js · video.js · Fabric.js · pg-boss + ffmpeg worker · Stripe.

- Marketing (`apps/marketing`): SvelteKit with `adapter-static` on Netlify.
- App (`apps/app`) and worker (`apps/worker`): Bun server and a separate Docker image, on a Hostinger KVM 4 VPS orchestrated by Coolify, at `app.treythornockgolf.com`.
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

None yet. After the restructure, document the Bun workspace commands (dev, build, test, typecheck) here.
