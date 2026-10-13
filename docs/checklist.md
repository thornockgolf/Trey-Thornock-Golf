# Project Checklist

Derived from `docs/roadmap.md`. Ordered by dependency: accounts and infrastructure first, then app foundation, then features. Roadmap item numbers are in parentheses.

## Phase 0: Accounts & Providers (nothing is set up yet)

- [x] **Hostinger**: create account
  - [x] Add SSH key
- [ ] **DNS**: domain is registered and DNS-hosted at **Wix** (nameservers `ns4/ns5.wixdns.net`); the root record points at Netlify. Trey must add records (or delegate access), and must NOT change nameservers or the root/`www` records
  - [ ] Add A records in Wix (Domains > Manage DNS Records) pointing at the Hostinger IP: `app`, `coolify`, `supabase`
- [x] **Cloudflare**: create account
  - [x] Enable R2 and create buckets (e.g. `videos-source`, `videos-processed`, `thumbnails`)
  - [x] Create R2 API token (scoped to those buckets)
  - [x] Configure R2 CORS for browser presigned uploads
- [x] **Clerk**: create account and application
  - [x] Get publishable and secret keys
  - [x] Configure allowed sign-in methods and redirect URLs for `app.` subdomain
- [ ] **Stripe**: create account, complete business verification (item 10)
  - [x] Get test-mode API keys
  - [x] Decide products/pricing for the two services (intake plan vs. 1:1 coaching) - We will be doing 1:1 coaching only for now.
- [x] **Netlify**: already set up (marketing site stays here)
- [ ] **GitHub**: create the org for the monorepo and confirm owner access for Coolify deploys

## Phase 1: Server Setup

- [x] Harden the server (non-root user, disable password SSH, unattended upgrades, fail2ban)
- [x] Install Coolify on the Hostinger VPS (reachable at `http://<ip>:8000` for now)
  - [ ] Put Coolify behind a domain with HTTPS (needs DNS records; then close public ports 8000, 6001-6002, 8080 and disable the Traefik dashboard)
  - [ ] Connect GitHub repo: blocked until Phase 3. The repo is public and owned by Trey's account (we only have push access), so Coolify can deploy it as a Public Repository, but auto-deploy webhooks, deploy keys or a GitHub App need an owner/admin. The app lives in the monorepo in the GitHub org (see Repo structure)
- [x] Deploy self-hosted Supabase (Docker stack) via Coolify (removed the `minio-createbucket` service from the compose file; `minio/mc` is gone from Docker Hub)
  - [x] Change all default secrets/JWT keys (Coolify generates random values)
  - [x] Confirm Postgres and Realtime are running
  - [ ] Switch the Supabase domain from the sslip.io URL to `supabase.treythornockgolf.com` (needs DNS), then copy URL and keys into `.env`
  - [ ] Set up automated Postgres backups (off-box, e.g. to R2)
- [ ] Set up monitoring/uptime check and basic log access

## Notes & Open Decisions

### Working plan until DNS and GitHub are sorted (decided 2026-10-07, updated for monorepo)
- We are building a **monorepo**: one repo holding the marketing site and the app. Develop both locally for now: the marketing site (SvelteKit, `adapter-static`, Netlify) and the app (SvelteKit, Bun server, Coolify on the VPS).
- This repo (`Trey-Thornock-Golf`) is the root of the monorepo, and the existing git history stays. Restructure it in place: move the marketing pages into `apps/marketing` and add `apps/app` and `packages/*` beside it.
- Do not push the restructure to `origin` (Trey's repo, `thornockgolf/Trey-Thornock-Golf`) yet. Netlify deploys the live site from its `main`, so moving the HTML files would break it. Commit locally, or on a branch, until the org exists. Then create the repo in the org, point `origin` at it, and push (see below).
- Local dev services: Clerk dev instance, Stripe test keys, the real R2 buckets (needs CORS set), and a local Postgres in Docker (or the VPS Supabase over its sslip.io URL for Realtime). `.env` stays out of git.
- Generate **one combined spec and one roadmap**, once. Run `/generate-app-spec` for the whole MVP, phased: Phase A is the monorepo restructure and marketing migration (roadmap items 1-3), written in detail; the app features (items 4+) follow, each in its own section. Then run `/generate-roadmap` (in a separate thread) on that `docs/app_spec.md`, review the spec and `docs/work_plan.md`, and start with the monorepo restructure and marketing migration.

### Repo structure: monorepo (decided)
- Layout: `apps/marketing` (SvelteKit, `adapter-static`, Netlify), `apps/app` (SvelteKit, Bun server, Coolify on the VPS), `packages/ui` and `packages/shared` (design tokens, components, shared types), managed with Bun workspaces.
- Why: cross-cutting changes (design tokens, UI library, booking/lesson types) land in one commit; one place for docs, specs, checklist and CI; shared code needs no publishing.
- Trade-offs to manage: the repo must live in an org we own (Coolify's GitHub App needs an owner); the repo is public, so the app code is public too (secrets stay in `.env`); one access list for both sites; path filters must be right or every push rebuilds both sites.
- Hosting: Trey creates a free GitHub organization and makes us an owner. The monorepo lives in that org. The org owner role is needed to install Coolify's GitHub App (auto-deploy, webhooks, deploy keys).
- Setup tasks:
  - [ ] Trey creates the GitHub org and makes us an owner
  - [x] Restructure this repo locally into `apps/marketing`, `apps/app` and `packages/*` with Bun workspaces (no push to Trey's repo)
  - [ ] Create the repo in the org, repoint `origin` to it (`git remote set-url origin <org repo>`) and push with full history
  - [ ] Once Netlify is relinked to the org repo, archive Trey's old repo
  - [ ] Netlify: approve the GitHub app for the org and relink the site (Site configuration > Build & deploy > Continuous deployment > Manage repository); base directory `apps/marketing`, publish directory `apps/marketing/build`, ignore command `git diff --quiet $CACHED_COMMIT_REF $COMMIT_REF -- apps/marketing packages` so app-only pushes skip the marketing build (needs Trey's Netlify access)
  - [ ] Coolify: install the GitHub App on the org; base directory `apps/app`, watch paths limited to `apps/app` and `packages`; build with the repo root as Docker context (or a Dockerfile that copies the workspace) so `packages/*` resolve
  - [ ] Confirm `packages/*` changes rebuild both sites and that app-only or marketing-only pushes rebuild just their own site

### App tech choices to research or decide
- [x] Runtime/tooling: Bun, TypeScript, Clerk, pg-boss, effect a typescript library for state management and side effects, skeleton a UI component library, and the Coolify build.
- [x] Write a style guide / design in skeleton using tokens from the look Trey already established in his HTML pages (`index.html`, `golf-lessons-durham.html`, `user-profile.html`, `index-trey-website.html`): colors, fonts, spacing, components. Use it to pick the UI library and keep the app consistent with the marketing site.

## Phase 2: Marketing Site (items 1-3)

- [x] Convert the `index.html` pages into a SvelteKit project (1)
- [x] Make it PWA compatible: manifest, icons, service worker, offline fallback (2)
- [ ] Deploy to Netlify using the SvelteKit static adapter
- [ ] Add "Sign In / Get Started" links pointing to `app.treythornockgolf.com` (4)
- [ ] Reorganize landing pages and improve flow (3, lower priority)

## Phase 3: App Foundation

- [ ] Create the app as `apps/app` in the monorepo (SvelteKit, Bun server), deploy on Coolify at `app.`
- [~] Integrate Clerk sign in / sign up (4) (built; not yet tried with a real session)
- [x] Design the Postgres schema (users, coaches, videos, annotations, plans, payments) (7)
  - [x] Store annotations as JSON (shape + timestamp), never burned into video (8)
  - [x] Write migrations
  - [x] Sync Clerk users into Postgres
- [x] Set up pg-boss job queue

## Phase 4: Video Pipeline

- [x] Presigned R2 upload endpoint (6)
- [x] Uppy.js uploader with progress, retries, chunking (6)
- [x] Keep original source files in R2 (needed later for pose estimation)
- [~] ffmpeg background worker on the VPS (built and tested locally; not deployed) consuming pg-boss jobs
  - [x] Transcode on upload
  - [x] Generate thumbnails
- [x] Video download for users and coaches (13)

## Phase 5: Video Analysis Features

- [x] video.js player with scrubbing and auto-replay at end (5)
- [x] Fabric.js annotation overlay (drawing on top of video) (5)
- [x] Save/load annotations as JSON tied to timestamps (8)
- [x] Side-by-side compare with pro video, with scrub slider for both (5)
- [x] Overlay one video on top of another (pro or previous swing) (9)
- [x] Coach-only re-record of segments without losing earlier annotations/video (8)

## Phase 6: Coaching Product

- [x] Expand intake questionnaire into structured questions about swing and goals (14)
- [ ] Generate practice plan from intake answers (service 1) (16)
- [x] Coach dashboard: view user videos, give feedback, assign practice plans (service 2) (16)
- [ ] Review existing practice plan pages for usability (15)
  - [x] Add calendar view for plans, check-ins, tests/assessments
- [x] Integrate Trey's player profile page (11)

## Phase 7: Chat & Notifications

- [ ] Chat between user and coach via Supabase Realtime (12)
  - [x] Chat API and screens, built and tested (polls every few seconds when Realtime is off)
  - [ ] Turn on Realtime push: set `SUPABASE_*` in `.env`/Coolify, then check a message reaches the other tab instantly (never run against the real Supabase)
- [x] Notification system (in-app: bell, unread badges, list; email is out of scope, web push is not built) (12)

## Phase 8: Payments

- [x] Stripe integration: checkout, webhooks, subscription/one-time handling (10) (test mode, a real test-card payment verified)
  - [ ] Register the webhook endpoint in the Stripe dashboard (`/webhooks/stripe`: `checkout.session.completed`, `customer.subscription.*`, `invoice.paid`, `invoice.payment_failed`) and put its signing secret in `STRIPE_WEBHOOK_SECRET`
  - [ ] Turn on the Customer Portal (cancel, update card) in Stripe's settings for live mode
- [x] Gate coaching features behind payment status
- [ ] Switch Stripe from test to live mode

## Phase 9: Launch Prep

- [ ] Test PWA install and uploads on real iOS and Android devices
- [x] Privacy policy and terms (user video and payment data) (drafted at /privacy and /terms; Trey to review, ideally a lawyer)
- [ ] Verify backups can be restored
- [ ] Production secrets audit

## Post-MVP

- [ ] Pose estimation / ML swing analysis (OpenCV + MediaPipe) as a Python worker on the pg-boss queue
