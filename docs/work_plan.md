# Work Plan

Generated 2026-10-12 from `docs/app_spec.md`. Phase headings mirror `docs/checklist.md`; roadmap item numbers are in parentheses. Only work **not already in `docs/checklist.md`** is listed here. `docs/checklist.md` and `docs/roadmap.md` are untouched.

Markers: **(Netlify)** marketing site, **(app)** `apps/app`, **(worker)** `apps/worker`, **(Coach only)** role-gated. Dependencies follow phase order; `(after: ...)` marks non-obvious ones. Spec section refs use the `3.X.Y` numbering.

## Already covered by docs/checklist.md (not repeated)

- Phase 0: Hostinger, Wix DNS records, R2 buckets/token/CORS, Clerk keys and redirect URLs, Stripe test keys and the product decision, Netlify, GitHub org.
- Phase 1: server hardening, Coolify install + HTTPS domain, Supabase deploy + domain switch, off-box Postgres backups, monitoring.
- Notes: monorepo restructure, repo/org/Netlify/Coolify relink tasks, the Bun/Effect/Skeleton research item, and the Skeleton style guide.

Work items below that touch these (monorepo layout, backups) only add the pieces the checklist does not describe.

## Phase 0: Accounts & Providers (gaps only)

- [ ] Create a Clerk **production** instance and keys, in addition to the dev instance (4) (after: DNS for `app.`)
- [ ] Create the Stripe products and prices in test mode: Initial Performance Assessment $149 one-time, Coaching Membership $49/month; record price IDs for env (10)
- [ ] Create a second R2 bucket for DB backups (`db-backups`) with its own scoped token (supports the checklist backup item)
- [ ] Confirm Trey's Clerk user ID for `COACH_CLERK_USER_IDS` (4)
- [ ] Confirm with Trey the access rule: assessment unlocks questionnaire/upload/report; membership unlocks feedback/chat/check-ins/plan updates (10) (spec assumption)
- [ ] Obtain or choose a labeled placeholder pro reference clip; real footage deferred (5, 9)

## Phase 1: Server Setup (gaps only)

- [ ] Add a `/healthz` check target and confirm Coolify health-check config for two apps (app, worker)
- [ ] Create the Realtime channel-authorization policy plan: verify self-hosted Realtime accepts custom-signed JWTs with the Supabase JWT secret (12) (after: Supabase running)

## Phase 2: Marketing Site (items 1-3)

### Monorepo and shared packages
- [x] Add root `package.json` with Bun workspaces, `tsconfig.base.json` (strict), and root scripts `dev`, `build`, `check`, `test`; commit on a local branch only
  - [x] `git mv` originals into `legacy/`; confirm `bun install && bun run build` works from a clean clone
- [x] Create placeholder workspaces `apps/app`, `apps/worker`, `packages/ui`, `packages/shared`, `packages/db`
- [x] Add `packages/shared` `siteConfig` (phone, email, address, scheduling URL, app link paths) (1)
- [x] Add `packages/ui` design tokens (green `#0B4F3A`, navy `#0E2B5C`, gold `#D4A017`; Poppins/Inter; see `docs/style-guide.md`) as CSS custom properties mapped to a Skeleton theme (after: style guide in checklist)

### SvelteKit migration (1)
- [x] Scaffold `apps/marketing` with `adapter-static`, `prerender = true`, `trailingSlash: 'never'`, build fails on broken internal links **(Netlify)**
- [x] Build `+layout.svelte` with sticky nav (scroll shadow, dropdowns), mobile hamburger (scroll lock, `aria-expanded`), and footer (1)
- [x] Add reusable reveal-on-scroll action honoring `prefers-reduced-motion` (1)
- [x] Move pricing, programs, testimonials, FAQ to typed modules in `src/lib/content/` (1)
- [x] Self-host Poppins and Inter subsets with `font-display: swap` (1)
- [ ] Add responsive WebP/AVIF images with width/height, lazy below the fold, eager hero (1)
- [x] Port home sections 1-8 (`home` ... `development`) with verbatim copy and anchors (1)
- [x] Port home sections 9-16 (`results` ... `lesson-experience`) (1)
- [x] Port home sections 17-22 (`about` ... `newsletter`), including pricing tabs (keyboard operable) (1)
- [x] Port booking form with `mailto:` fallback (subject "Lesson Request: <type>", no success message) and external Book CTAs with `rel="noopener"` (1)
- [x] Port the Durham page (1)
- [x] Add `<title>`, meta description, canonical, and LocalBusiness JSON-LD per page from `siteConfig`; add Open Graph tags (1)
- [x] Generate `sitemap.xml` and `robots.txt` (1)
- [x] Add `netlify.toml`: build/publish dirs, `.html` to clean-URL 301s (incl. `/golf-lessons-durham.html`), security headers, CSP, ignore command **(Netlify)**
- [ ] Side-by-side crawl check of the old URL list vs. the new site; zero 404s (after: GitHub org + Netlify relink in checklist)

### PWA (2)
- [x] Generate 192, 512, maskable, and Apple touch icons from `img-01.png`; add `manifest.webmanifest` (2)
- [x] Add `src/service-worker.ts`: network-first HTML, cache-first hashed assets/fonts/images, versioned caches deleted on activate, no cross-origin or `app.` caching (2)
- [x] Add `/offline` route with plain phone and email links (2)
- [x] Document the service-worker unregister/cache-bust recovery step in `README.md` (2)
- [ ] Run Lighthouse (installability, mobile Performance >= 90) and fix regressions (2)

### Sign In / Get Started (4)
- [x] Add `PUBLIC_APP_URL` and `PUBLIC_SHOW_APP_LINKS` and render Sign In / Get Started in nav, mobile menu, and footer only when the flag is `"true"` (4) (after: app subdomain live, Phase 3)

### Reorganization (3, lower priority)
- [ ] Get Trey's approval of the proposed IA (`/`, `/programs`, `/junior`, `/club-fitting`, `/pricing`, `/about`, `/contact`) (3)
- [ ] Split sections into the new routes; keep a content inventory so nothing is lost (3)
- [ ] Add client-side legacy `#section` to route redirects and one primary CTA per screen (3)

## Phase 3: App Foundation

- [x] Verify Bun against SvelteKit dev/build, the Clerk SDK, pg-boss, and the Coolify Docker build; record fallbacks **(app)**
- [ ] Scaffold `apps/app` with `@sveltejs/adapter-node` (run on Bun), Skeleton, Tailwind, `/healthz` **(app)**
- [x] Add Effect foundation: `runRoute` helper, tagged errors (`NotAuthenticated`, `Forbidden`, `NotFound`, `ValidationError`, `StorageError`, `PaymentError`) mapped to `{ code, message }` **(app)**
- [ ] Add Effect services and live/test layers: `Db` (done), `Users` (done), `R2` (done), `Clerk`, `Queue` **(app)**
- [ ] Add `packages/shared` Effect Schema definitions and constants (upload limits, roles) (4)
- [x] Write migration runner in `packages/db` (forward-only SQL, idempotent) and run it on app deploy (7)
- [x] Write migration: `users`, `player_profiles`, `coach_assignments`, `coach_notes` (7)
- [x] Write migration: `videos`, `analyses`, `analysis_segments`, `annotations` (JSON + `start_ms`/`end_ms`) with indexes (7, 8)
- [x] Write migration: `conversations`, `messages`, `notifications` (12)
- [x] Write migration: `subscriptions`, `payments`, `stripe_events` (10)
- [x] Write migration: `questionnaire_responses`, `drills`, `practice_plans`, `plan_assignments`, `plan_sessions`, `check_ins`, `assessments`, `assessment_results` (14, 15, 16)
- [ ] Implement Clerk session verification in `hooks.server.ts` producing `CurrentUser`; redirect to `/sign-in` or return 401 (4)
- [ ] Add `/sign-in` and `/sign-up` pages using Clerk components (4)
- [x] Create `users` row on first sign-in (role `player`) via Clerk sync; resolve `coach` from `COACH_CLERK_USER_IDS` (4)
- [x] Add `RoleGuard` and `/coach` route group returning 403 to players **(Coach only)** (4)
- [x] Add app shell: Skeleton app bar, bottom nav (mobile), side nav (desktop) (4)
- [x] Add app PWA: manifest, shell-only service worker, offline banner with disabled upload/chat, update toast; never cache API or media (4)
- [x] Set up pg-boss in `apps/worker` and the app producer with the schema in Postgres; add worker `/healthz` **(worker)**
- [~] Add Dockerfiles with repo-root context for app and worker, ffmpeg in the worker image; deploy both on Coolify with watch paths limited to each app plus `packages` (after: GitHub App in checklist) (Dockerfiles done and tested locally; deploy on Coolify pending, see docs/deploy.md)
- [ ] Add rate-limit middleware and CSP for the app (4)
- [ ] Add account-deletion job that removes dependents before the user row (7)

## Phase 4: Video Pipeline

- [x] Add `POST /api/videos`: validate type/size/duration, check ownership, create row, issue presigned PUT (multipart for large) with key `raw/{video_id}/source.{ext}` and 15 min TTL (6) (after: R2 CORS in checklist)
- [x] Add `POST /api/videos/:id/complete`: HEAD the object, 409 if missing, set `uploaded`, enqueue `video.uploaded` (6)
- [x] Add Uppy uploader (`UploadPanel`) with resumable multipart, progress, retry, camera capture, and a runes store; never show success before `/complete` (6) (built and tested against a mock server; not yet tried with a real signed-in browser session or phone camera)
- [x] Add `/videos/new` page and `/videos` library list with status and poster (6)
- [x] Worker: `video.uploaded` consumer downloads source, transcodes to H.264/AAC MP4 (faststart, <=1080p, CFR, keyframe every 0.5 s), uploads output **(worker)**
- [x] Worker: generate poster and scrub sprite (`sprite.jpg` + `sprite.vtt`), probe duration/fps/size, set `ready` **(worker)**
- [x] Worker: retries (3, backoff), `failed` status with error code, concurrency cap, ffmpeg timeout and temp cleanup, idempotent overwrite; never delete source **(worker)**
- [ ] Publish `video.ready` / `video.failed` events to `user:{id}` (after: Realtime channel plan in Phase 1) (12)
- [x] Add `GET /api/videos/:id/playback` (signed GET, 1 h, owner or assigned coach) and `GET /api/videos/:id/download?variant=` (processed or original, `Content-Disposition: attachment`) (13)
- [x] Add coach-assignment helper and tests for the 403 matrix on video endpoints (13)

## Phase 5: Video Analysis

- [x] Build `VideoPlayer` in `packages/ui` using video.js: scrub bar, frame step (1/fps, arrow keys), rates 0.1x-2x, auto-replay toggle (default on), `playsinline`, signed URL refresh on error (5) (verified in desktop Chromium; not yet on iOS Safari or a real phone)
- [x] Add `/videos/:id` page with player and sprite preview (5)
- [x] Add annotation API `GET/POST/PATCH/DELETE /api/videos/:id/annotations` with Effect Schema allowlist, size cap, `updated_at` conflict 409, coach-only writes (8) (conflicts use the integer `version`; PATCH/DELETE are at `/annotations/:annotationId`; verified by 12 API tests on a real database)
- [x] Build `AnnotationCanvas` with Fabric.js overlay, normalized 0-1 coordinates, ResizeObserver sizing, tools: line, arrow, circle, angle, freehand, text, color, undo/redo, clear **(Coach only)** (5, 8) (verified with a mouse in desktop Chromium on `/dev/annotations`; not yet by touch, on iOS Safari, or with a real portrait video)
- [x] Render annotations read-only for players between `start_ms` and `end_ms` (5, 8) (verified on `/dev/annotations?role=player`)
- [ ] Add reference library: `videos.kind = 'reference'`, `GET /api/references`, and a coach upload form on `/coach/library` using the same pipeline **(Coach only)** (5)
- [ ] Build `CompareView` with two players, independent sliders, Sync toggle, sync points per video, last-frame hold for shorter video (5) (after: reference library)
- [ ] Build `OverlayView` with opacity/scale/position and shared sync points; persist `overlay_settings` via `GET/PUT /api/analyses/:id/overlay` (9)
- [ ] Add `POST /api/analyses` and the `/coach/videos/:id/analyze` page shell **(Coach only)** (8)
- [ ] Build `AnalysisRecorder`: MediaRecorder capture (mic, optional camera), range selection, segment timeline **(Coach only)** (8)
- [ ] Add `POST /api/analyses/:id/segments`: presigned upload for a segment, replace only overlapping segments, mark `replaced_at`, keep prior live until the new one is `ready` **(Coach only)** (8) (after: annotations table)
- [ ] Worker: `analysis.segment.uploaded` normalizes segment to MP4/AAC; failure keeps previous segments live **(worker)** (8)
- [ ] Add prompt to keep (default) or remove annotations inside the re-recorded range **(Coach only)** (8)
- [ ] Add manifest-based sequential playback of analysis segments in the player (8)
- [ ] Worker: `retention.sweep` scheduled job deleting segments replaced over 30 days ago **(worker)** (8)
- [ ] Add coach undo of a replaced segment within 30 days **(Coach only)** (8)

## Phase 6: Coaching Product

- [ ] Define structured questionnaire config and Schema in `packages/shared` (from the rules in `index-trey-website.html`), versioned (14)
- [ ] Build `QuestionnaireStepper` with draft save/resume, per-question validation, retake creating a new version; `GET/POST /api/questionnaire` (14)
- [ ] Show the latest questionnaire response on the coach's player detail page **(Coach only)** (14)
- [ ] Migrate drills from `index-trey-website.html` into a seed for `drills` and plan templates (15, 16)
- [ ] Add drill and plan CRUD `GET/POST/PATCH /api/drills, /api/plans` with session-total validation (30/45/60/90 min exact) **(Coach only)** (16)
- [ ] Build plan composer on `/coach/library` **(Coach only)** (16)
- [ ] Add `POST /api/plans/:id/assign`: create `plan_assignments` and `plan_sessions` from a start date **(Coach only)**; write a `notifications` row (16)
- [ ] Build player `/plans` view with `DrillCard`, and `PATCH /api/sessions/:id/items/:itemId` to mark complete (15, 16)
- [ ] Build `/coach` dashboard: players, new videos, unread **(Coach only)** (16)
- [ ] Build `/coach/players/:id`: notes, videos, plan progress, results **(Coach only)**; `GET/POST /api/players/:id/notes` never returned to players (16)
- [ ] Build `PlanCalendar` (month/week/list) at 360 px, showing sessions (15)
- [ ] Add check-ins: schedule, `GET/POST /api/check-ins`, player form, coach notification (15)
- [ ] Add assessments: coach defines tests and records results, player sees value and trend; `GET/POST /api/assessments` **(Coach only)** for authoring (15)
- [ ] Port `user-profile.html` to `/profile` with `GET/PUT /api/profile` (handicap -10 to 54), photo via the presigned R2 flow with image limits (11)
- [ ] Show the profile summary (videos, plan, subscription status) and coach notes view for the coach (11)

## Phase 7: Chat & Notifications

- [ ] Add `POST /api/realtime/token`: mint a <=5 min Supabase-signed JWT scoped to one conversation after the participant check (12) (after: Realtime accepts custom JWT, Phase 1)
- [ ] Add the Realtime channel-authorization policy migration checking that claim (the only DB-side auth) (12)
- [ ] Add `GET/POST /api/conversations/:id/messages`: 4,000-char cap, 30 msg/min limit, participant-only, create conversation per coach-player pair (12)
- [ ] Build `ChatThread` with Realtime `Stream` store, id-cursor catch-up on reconnect, de-dup, and video-reference chip that jumps to the timestamp (12)
- [ ] Add `/messages` and `/messages/:id` pages (12)
- [ ] Add notification writers (new message, video ready, analysis ready, plan assigned, payment issue) and `GET/PATCH /api/notifications` (12)
- [ ] Build `NotificationBell` with unread badges from Postgres plus Realtime on `user:{id}` (12)
- [ ] Web Push for the installed PWA (Could-Have) (12)

## Phase 8: Payments

- [ ] Add `Stripe` Effect service and `POST /api/billing/checkout` (mode `payment` for assessment, `subscription` for membership; membership only after assessment paid) (10)
- [ ] Add `POST /webhooks/stripe`: raw body, signature verification, 400 on forged, idempotent via `stripe_events` (10)
- [ ] Handle `checkout.session.completed`, `customer.subscription.*`, `invoice.paid`, `invoice.payment_failed`; write `subscriptions` and `payments` only here (10) (after: webhook handler)
- [ ] Register the webhook endpoint in the Stripe test dashboard and set `STRIPE_WEBHOOK_SECRET` (10)
- [ ] Add `POST /api/billing/portal` and `/billing` page reading state from Postgres only (10)
- [ ] Add `BillingBanner` for `past_due`, and the grace-period rule (10)
- [ ] Gate by status: assessment unlocks questionnaire/upload; membership unlocks feedback, chat (402 + billing link), check-ins, plan updates (10) (after: webhooks writing status)
- [ ] Run the full test-mode flow end to end (checkout, failure, cancel, forged webhook, success-page spoof) (10)
- [ ] Switch to Stripe live mode: live keys, live webhook, live prices (10) (after: test-mode flow passing)

## Phase 9: Launch Prep

- [ ] Run the automated test suite (Vitest, Playwright) for the critical paths: role permissions, presign, Stripe webhooks, annotations, job pipeline
- [ ] Test PWA install and upload on real iOS and Android devices for both apps, including camera capture and `playsinline`
- [ ] Add privacy policy and terms pages (video and payment data) on the marketing site **(Netlify)**
- [ ] Restore a Postgres backup into a scratch DB and verify
- [ ] Audit production secrets; confirm only `PUBLIC_*` reach browsers and nothing is committed
- [ ] Verify nightly backup to the `db-backups` bucket and a pre-migration backup step
- [ ] Verify Netlify rollback and Coolify previous-image rollback
- [ ] Submit the sitemap to Search Console after cutover

## Post-MVP

- [ ] Pose estimation as a Python worker consuming a new pg-boss job type, reading raw source from R2
- [ ] Self-serve intake to generated plan (rule-based, server side) (16) (Could-Have; deferred per checklist's 1:1-only decision)
- [ ] Flattened analysis export via `analysis.assemble` (8) (Could-Have)
- [ ] Player drawing on own videos (5) (Should-Have)
- [ ] Captions field for coach analysis (Should-Have)

## Conflicts and flags

- **Self-serve intake plan (16a)** is Could-Have in the spec and the checklist says 1:1 coaching only for now. Placed in Post-MVP, not scheduled.
- **Item 16 service 1 (intake plan service)** therefore has no MVP work item beyond the questionnaire (14).
- **Realtime channel policy** is the one DB-side auth exception. It is allowed by the spec but needs a Phase 1 check that self-hosted Realtime accepts custom JWTs; if not, fall back to Broadcast from the app server.
- **Access rule** (assessment vs. membership unlocks) is a spec assumption pending Trey's confirmation. Phase 8 gating depends on it.
- **Phase numbering**: the spec's own implementation phases (1-6) differ from the checklist's. This plan uses the checklist numbering.
- **Marketing Sign In links** are deferred until the app subdomain is live (Phase 3), even though they sit in the marketing phase.
- No spec task violates the architecture rules (annotations JSON, source retained, direct R2 upload, heavy work via pg-boss, payment state from webhooks only).

## Roadmap coverage

Items 1-3 (Phase 2), 4 (Phases 2, 3), 5 (Phases 5), 6 (Phase 4), 7 (Phase 3), 8 (Phase 5), 9 (Phase 5), 10 (Phase 8), 11 (Phase 6), 12 (Phase 7), 13 (Phase 4), 14 (Phase 6), 15 (Phase 6), 16 (Phase 6, Post-MVP).
