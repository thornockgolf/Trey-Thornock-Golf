# Project Checklist

Derived from `roadmap.md`. Ordered by dependency: accounts and infrastructure first, then app foundation, then features. Roadmap item numbers are in parentheses.

## Phase 0: Accounts & Providers (nothing is set up yet)

- [ ] **Hostinger**: create account, add payment method (PayPal)
  - [ ] Add SSH key
  - [ ] Provision KVM 4 VPS (4 vCPU / 16GB RAM, Ubuntu 24.04, 1-month billing)
  - [ ] Enable backups and set up the Hostinger firewall (allow 22, 80, 443 only)
- [ ] **DNS**: domain is already owned; make sure you can log into wherever its DNS is managed (registrar or Netlify)
  - [ ] Add `app.treythornockgolf.com` A record pointing at the Hostinger IP (after the server exists)
- [ ] **Cloudflare**: create account
  - [ ] Enable R2 and create buckets (e.g. `videos-source`, `videos-processed`, `thumbnails`)
  - [ ] Create R2 API token (scoped to those buckets)
  - [ ] Configure R2 CORS for browser presigned uploads
- [ ] **Clerk**: create account and application
  - [ ] Get publishable and secret keys
  - [ ] Configure allowed sign-in methods and redirect URLs for `app.` subdomain
- [ ] **Stripe**: create account, complete business verification (item 10)
  - [ ] Get test-mode API keys
  - [ ] Decide products/pricing for the two services (intake plan vs. 1:1 coaching)
- [x] **Netlify**: already set up (marketing site stays here)
- [ ] **GitHub**: confirm repo access for Coolify deploys (repo is already public)

## Phase 1: Server Setup

- [ ] Harden the server (non-root user, disable password SSH, unattended upgrades, fail2ban)
- [ ] Install Coolify on the Hostinger VPS
  - [ ] Put Coolify behind a domain with HTTPS
  - [ ] Connect GitHub repo
- [ ] Deploy self-hosted Supabase (Docker stack) via Coolify
  - [ ] Change all default secrets/JWT keys
  - [ ] Confirm Postgres and Realtime are running
  - [ ] Set up automated Postgres backups (off-box, e.g. to R2)
- [ ] Set up monitoring/uptime check and basic log access

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
