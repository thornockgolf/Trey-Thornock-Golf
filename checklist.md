# Project Checklist

Derived from `roadmap.md`. Ordered by dependency: accounts and infrastructure first, then app foundation, then features. Roadmap item numbers are in parentheses.

## Phase 0: Accounts & Providers (nothing is set up yet)

- [x] **Hostinger**: create account
  - [x] Add SSH key
- [ ] **DNS**: domain is registered and DNS-hosted at **Wix** (nameservers `ns4/ns5.wixdns.net`); the root record points at Netlify. Trey must add records (or delegate access), and must NOT change nameservers or the root/`www` records
  - [ ] Add A records in Wix (Domains > Manage DNS Records) pointing at the Hostinger IP: `app`, `coolify`, `supabase`
- [x] **Cloudflare**: create account
  - [x] Enable R2 and create buckets (e.g. `videos-source`, `videos-processed`, `thumbnails`)
  - [x] Create R2 API token (scoped to those buckets)
  - [ ] Configure R2 CORS for browser presigned uploads
- [x] **Clerk**: create account and application
  - [x] Get publishable and secret keys
  - [x] Configure allowed sign-in methods and redirect URLs for `app.` subdomain
- [ ] **Stripe**: create account, complete business verification (item 10)
  - [x] Get test-mode API keys
  - [x] Decide products/pricing for the two services (intake plan vs. 1:1 coaching) - We will be doing 1:1 coaching only for now.
- [x] **Netlify**: already set up (marketing site stays here)
- [ ] **GitHub**: confirm repo access for Coolify deploys (repo is already public)

## Phase 1: Server Setup

- [x] Harden the server (non-root user, disable password SSH, unattended upgrades, fail2ban)
- [x] Install Coolify on the Hostinger VPS (reachable at `http://<ip>:8000` for now)
  - [ ] Put Coolify behind a domain with HTTPS (needs DNS records; then close public ports 8000, 6001-6002, 8080 and disable the Traefik dashboard)
  - [ ] Connect GitHub repo: blocked until Phase 3. The repo is public and owned by Trey's account (we only have push access), so Coolify can deploy it as a Public Repository, but auto-deploy webhooks, deploy keys or a GitHub App need an owner/admin. Decide with Trey whether the app lives in a new repo we own or a subfolder of his
- [x] Deploy self-hosted Supabase (Docker stack) via Coolify (removed the `minio-createbucket` service from the compose file; `minio/mc` is gone from Docker Hub)
  - [x] Change all default secrets/JWT keys (Coolify generates random values)
  - [x] Confirm Postgres and Realtime are running
  - [ ] Switch the Supabase domain from the sslip.io URL to `supabase.treythornockgolf.com` (needs DNS), then copy URL and keys into `.env`
  - [ ] Set up automated Postgres backups (off-box, e.g. to R2)
- [ ] Set up monitoring/uptime check and basic log access

## Notes & Open Decisions

### Working plan until DNS and GitHub are sorted (decided 2026-10-07)
- Develop both projects locally for now: the marketing site (SvelteKit, `adapter-static`, Netlify) and the app (separate SvelteKit project, Node adapter, Coolify on the VPS).
- Keep the app in its own local folder with its own `git init`; do not push it to Trey's repo. Add a remote once the repo question below is settled.
- Local dev services: Clerk dev instance, Stripe test keys, the real R2 buckets (needs CORS set), and a local Postgres in Docker (or the VPS Supabase over its sslip.io URL for Realtime). `.env` stays out of git.
- Run the generate-roadmap skill in a separate thread, review `app_spec.md` (which covers only the marketing site) and the roadmap, then start the marketing migration. The app needs its own spec (`/generate-app-spec`) before Phase 3.

### Where the app's code lives (decide with Trey)
- Preferred: Trey creates a free GitHub organization and makes us an owner; the app goes in a new repo in that org. The existing marketing repo stays put, so Netlify needs no change.
- Org owner is needed to install Coolify's GitHub App on the org (auto-deploy, webhooks, deploy keys).
- Optional later: transfer the marketing repo into the org too. Netlify would then need the GitHub app approved for the org and the site relinked (Site configuration > Build & deploy > Continuous deployment > Manage repository).

### App tech choices to research or decide
- [ ] Runtime/tooling: Bun, TypeScript. Verify Bun works with SvelteKit's Node adapter, Clerk, pg-boss and the Coolify build before committing to it.
- [ ] **Look into Effect** (the TypeScript library) and decide how much of the app should use it.
- [ ] Choose a UI component library for the app.
- [ ] Write a style guide / design tokens from the look Trey already established in his HTML pages (`index.html`, `golf-lessons-durham.html`, `user-profile.html`, `index-trey-website.html`): colors, fonts, spacing, components. Use it to pick the UI library and keep the app consistent with the marketing site.

## Phase 2: Marketing Site (items 1-3)

- [ ] Convert the `index.html` pages into a SvelteKit project (1)
- [ ] Make it PWA compatible: manifest, icons, service worker, offline fallback (2)
- [ ] Deploy to Netlify using the SvelteKit static adapter
- [ ] Add "Sign In / Get Started" links pointing to `app.treythornockgolf.com` (4)
- [ ] Reorganize landing pages and improve flow (3, lower priority)

## Phase 3: App Foundation

- [ ] Create the app as a separate SvelteKit project (Node adapter), deploy on Coolify at `app.`
- [ ] Integrate Clerk sign in / sign up (4)
- [ ] Design the Postgres schema (users, coaches, videos, annotations, plans, payments) (7)
  - [ ] Store annotations as JSON (shape + timestamp), never burned into video (8)
  - [ ] Write migrations
  - [ ] Sync Clerk users into Postgres
- [ ] Set up pg-boss job queue

## Phase 4: Video Pipeline

- [ ] Presigned R2 upload endpoint (6)
- [ ] Uppy.js uploader with progress, retries, chunking (6)
- [ ] Keep original source files in R2 (needed later for pose estimation)
- [ ] ffmpeg background worker on the VPS consuming pg-boss jobs
  - [ ] Transcode on upload
  - [ ] Generate thumbnails
- [ ] Video download for users and coaches (13)

## Phase 5: Video Analysis Features

- [ ] video.js player with scrubbing and auto-replay at end (5)
- [ ] Fabric.js annotation overlay (drawing on top of video) (5)
- [ ] Save/load annotations as JSON tied to timestamps (8)
- [ ] Side-by-side compare with pro video, with scrub slider for both (5)
- [ ] Overlay one video on top of another (pro or previous swing) (9)
- [ ] Coach-only re-record of segments without losing earlier annotations/video (8)

## Phase 6: Coaching Product

- [ ] Expand intake questionnaire into structured questions about swing and goals (14)
- [ ] Generate practice plan from intake answers (service 1) (16)
- [ ] Coach dashboard: view user videos, give feedback, assign practice plans (service 2) (16)
- [ ] Review existing practice plan pages for usability (15)
  - [ ] Add calendar view for plans, check-ins, tests/assessments
- [ ] Integrate Trey's player profile page (11)

## Phase 7: Chat & Notifications

- [ ] Chat between user and coach via Supabase Realtime (12)
- [ ] Notification system (in-app, plus email/push as needed) (12)

## Phase 8: Payments

- [ ] Stripe integration: checkout, webhooks, subscription/one-time handling (10)
- [ ] Gate coaching features behind payment status
- [ ] Switch Stripe from test to live mode

## Phase 9: Launch Prep

- [ ] Test PWA install and uploads on real iOS and Android devices
- [ ] Privacy policy and terms (user video and payment data)
- [ ] Verify backups can be restored
- [ ] Production secrets audit

## Post-MVP

- [ ] Pose estimation / ML swing analysis (OpenCV + MediaPipe) as a Python worker on the pg-boss queue
