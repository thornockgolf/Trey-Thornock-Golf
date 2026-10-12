# Trey Thornock Golf Platform (Monorepo, Marketing Site, Coaching App) - Application Specification

> Generated: 2026-10-12
> Status: Draft
> Extends: Trey Thornock Golf platform (see docs/roadmap.md, docs/ARCHITECTURE.md)
> Roadmap items: 1-16
> Service: Marketing site (Part A) | One-on-One Coaching (Parts B-E) | Intake/Practice Plan (Part F)
> Supersedes: the marketing-only `docs/app_spec.md` generated 2026-10-06. Its content is carried into Part A.

This is one combined spec for the whole MVP. It is organized into parts that map to build phases:


| Part | Scope                                                                        | Roadmap items           | Detail level |
| ---- | ---------------------------------------------------------------------------- | ----------------------- | ------------ |
| A    | Monorepo restructure + marketing site migration, PWA, landing reorganization | 1, 2, 3, link part of 4 | Full detail  |
| B    | App foundation: auth, roles, schema, deploy                                  | 4, 7                    | Full detail  |
| C    | Video: upload, processing, playback, download                                | 5 (playback), 6, 13     | Full detail  |
| D    | Analysis: annotations, compare, overlay, coach re-record                     | 5, 8, 9                 | Full detail  |
| E    | Communication, payments, profile                                             | 10, 11, 12              | Full detail  |
| F    | Questionnaire, practice plans, calendar                                      | 14, 15, 16              | Full detail  |


---



## 1. Executive Summary



### Problem Statement

Trey Thornock Golf is two hand-written HTML marketing pages (`index.html` ~113 KB, `golf-lessons-durham.html` ~70 KB), a separate practice-plan generator (`index-trey-website.html`), and a player profile mockup (`user-profile.html`). Nav, footer, styles, and scripts are duplicated per page; there is no build step, PWA support, auth, video, chat, or payment capability. Coaching today happens in person, and remote swing review, feedback, and practice-plan follow-up have no home.

### Solution Overview

Build a Bun-workspaces monorepo in this repo: `apps/marketing` (static SvelteKit on Netlify, `treythornockgolf.com`) and `apps/app` (SvelteKit on a Bun server, Coolify on the Hostinger VPS, `app.treythornockgolf.com`), plus `apps/worker` (ffmpeg/pg-boss) and shared `packages/*`. Everything is TypeScript with Effect for services, errors, and side effects, and Skeleton UI for components. The marketing site is migrated first (faithful port, then PWA, then oanization). The app then delivers the 1:1 coaching flow: a player uploads swing video, the coach annotates, compares, overlays and re-records analysis, they chat, the player pays via Stripe, and the coach assigns practice plans on a calendar.

### Target Users

- **Player**: wants swing feedback and a plan to follow without being on the range with Trey. Mostly on a phone, often on weak course or range Wi-Fi.
- **Coach (Trey)**: wants to review uploaded swings, draw on and compare them, record spoken analysis, and assign work, mostly from a laptop or tablet, without duplicating admin.
- **Visitor (marketing site)**: prospective player or parent who wants programs, pricing, a booking link, and a clear Sign In.



### Success Metrics

- Every URL indexed today still resolves (200 or one 301) after marketing cutover; zero 404s in a crawl of the old URL list.
- Marketing: Lighthouse mobile Performance >= 90, installable PWA, 0 duplicated nav/footer copies.
- A player can go from sign-up to a coach-visible, playable video in under 5 minutes on a 30 Mbps connection (60 s, 1080p clip).
- Processed video time-to-ready <= 2x clip duration on the KVM 4.
- Scrub-to-frame latency < 100 ms on processed videos on a mid-range phone.
- 100% of payment state changes originate from verified Stripe webhooks.

---



## 2. Technical Context



### Stack

SvelteKit (PWA) · Bun · TypeScript · Effect · Skeleton UI · Clerk · self-hosted Supabase (Postgres + Realtime) · Cloudflare R2 · Uppy.js · video.js · Fabric.js · pg-boss + ffmpeg worker · Stripe · Netlify (marketing) · Hostinger VPS + Coolify (app)

### Monorepo Layout

This repo is the monorepo root; existing git history is kept. Bun workspaces (`bun.lock`, no npm/pnpm/yarn). TypeScript strict, shared `tsconfig.base.json`.

```
apps/
  marketing/          SvelteKit, adapter-static, Netlify
    src/routes/  src/lib/components/  src/lib/content/  static/
  app/                SvelteKit, @sveltejs/adapter-node run on Bun, Coolify (VPS)
    src/routes/(public)  (player)  (coach)  api/  webhooks/
    src/lib/server/     Effect services + layers (Db, R2, Stripe, Queue, Clerk, Realtime)
    src/lib/client/     Svelte components, Effect runtime bridge
  worker/             Bun process: pg-boss consumers, ffmpeg (separate Docker image)
packages/
  ui/                 Skeleton theme, design tokens, shared Svelte components
  shared/             Domain types, Schema definitions (Effect Schema), constants, siteConfig
  db/                 SQL migrations + typed query layer (used by app and worker)
legacy/               original HTML kept until cutover is verified, then removed
docs/               roadmap.md  ARCHITECTURE.md  checklist.md  app_spec.md  work_plan.md
```

`index-trey-website.html` and `user-profile.html` are inputs to Parts F and E. They are moved to `legacy/` with the other originals.

### Where This Touches the Architecture

- **Deployment targets**: Netlify (`apps/marketing`); VPS app (`apps/app`); VPS worker (`apps/worker`). Supabase stack already deployed via Coolify (Phase 1 of the checklist).
- **Components involved**: all in `docs/ARCHITECTURE.md`: App server, Postgres, Realtime, R2, pg-boss, ffmpeg worker, Clerk, Stripe, Netlify.
- **Data flows**: extends the four flows in `docs/ARCHITECTURE.md` (upload to processing to playback, auth, chat, payments). New flows are spelled out per part.
- **CI/deploy isolation**: Netlify ignore command and Coolify watch paths limit each deploy to its own app plus `packages/` (see Part A and section 11).



### Versions
No versions are pinned in this spec. At implementation time, install the **latest stable release** of every package (Bun, TypeScript, SvelteKit/Svelte, Effect, Skeleton + Tailwind, and the rest of Stack Extensions) and check the docs for current package names and APIs rather than relying on names written here. Let `bun.lock` pin the resolved versions once installed. If the latest versions of two packages conflict (for example Skeleton and Tailwind), pick the newest compatible set and record it in the PR.

### Cross-cutting Conventions

- **Effect**: each external dependency is an Effect `Context.Service` (Effect v4; `Context.Tag` in v3) with a `Layer` (live and test). Errors are tagged (`Schema.TaggedError` in v4, `Data.TaggedError` in v3): `NotAuthenticated`, `Forbidden`, `NotFound`, `ValidationError`, `StorageError`, `PaymentError`. SvelteKit `+server.ts`/form-action handlers run an Effect via a single `runRoute` helper that maps tagged errors to HTTP status codes. Request bodies are decoded with Effect `Schema` from `packages/shared`. Svelte runes hold only local UI state; client data fetching goes through small Effect-backed helpers.
- **Skeleton UI**: theme and tokens defined once in `packages/ui` from Trey's existing look (green `#0B4F3A`, navy `#0E2B5C`, gold `#D4A017`; Poppins/Inter; defined in `docs/style-guide.md`), consumed by both apps. Prefer Skeleton components (AppBar, Tabs, Modal, Toast, Progress, Switch, Accordion) over hand-rolled equivalents.
- **Authorization**: every handler resolves `CurrentUser` (Clerk session) and `Role` (player/coach) first, then checks resource ownership or coach assignment in the app server, never in Postgres (one exception: Realtime channel auth, see Part E).
- **Timestamps**: video time is milliseconds (integer) from the start of the processed analysis timeline.

---



# PART A: Monorepo + Marketing Site (items 1, 2, 3, link of 4)



## 3. Feature Categories



### 3.A.0 Monorepo restructure



#### Feature: Restructure repo in place into Bun workspaces

**Priority**: Must-Have
**Roles**: Developers (Coach is not affected)

**Description**:
Move the existing HTML to `legacy/`, create `apps/marketing`, `apps/app` (placeholder until Part B), `apps/worker` (placeholder), and `packages/{ui,shared,db}`. Root `package.json` with `workspaces`, root scripts (`bun run dev`, `build`, `check`, `test`). Commit locally or on a branch only. Do not push to `thornockgolf/Trey-Thornock-Golf` (Netlify deploys the live site from its `main`; moving the HTML would break it) until the new org repo exists.

**Acceptance Criteria**:

```gherkin
Scenario: Fresh clone builds
  Given a clean clone and Bun installed
  When `bun install && bun run build` runs at the root
  Then every workspace builds with no errors and a single bun.lock is used

Scenario: Live site untouched
  Given the restructure is committed on a local branch
  When origin's main is inspected
  Then it still contains the original root index.html and Netlify is unaffected

Scenario: Selective rebuild
  Given a change only under apps/app
  When the Netlify ignore command runs
  Then the marketing build is skipped
  And a change under packages/ triggers both apps
```

**Technical Notes**:

- History is preserved with `git mv`.
- Once the GitHub org exists: create the org repo, `git remote set-url origin <org repo>`, push full history, relink Netlify (base `apps/marketing`, publish `apps/marketing/build`, ignore command `git diff --quiet $CACHED_COMMIT_REF $COMMIT_REF -- apps/marketing packages`), archive Trey's old repo.
- Verify Bun works with SvelteKit dev/build, Clerk, pg-boss, and the Coolify Docker build early in Part B (checklist item).



### 3.A.1 SvelteKit Migration (item 1)



#### Feature: Static SvelteKit project with shared layout

**Priority**: Must-Have | **Roles**: Visitor

**Description**:
`apps/marketing` uses `@sveltejs/adapter-static`, prerendering every route. One `+layout.svelte` owns the sticky nav (scroll shadow, dropdowns, hamburger/mobile menu) and footer, replacing per-page copies and inline `<script>` blocks.

**User Story**: As Trey, I want the nav and footer defined once so a change appears on every page.

**Acceptance Criteria**:

```gherkin
Scenario: Build output is fully static
  Given the project is built with the static adapter
  When the build completes
  Then every route exists as prerendered HTML and no server runtime is needed

Scenario: Shared layout
  Given the home and Durham pages
  When nav links or footer text change in the layout component
  Then both pages show the change after one rebuild

Scenario: Mobile menu
  Given a viewport below the current mobile breakpoint
  When the user taps the hamburger
  Then the menu opens, body scroll locks, aria-expanded is "true"
  And tapping a link or the close control closes it and restores scroll
```

**Technical Notes**:

- `export const prerender = true` in the root layout; fail the build on broken internal links.
- Replace inline scripts (scroll-shadow nav, reveal-on-scroll, pricing tabs, hamburger, footer year) with components/actions. Reveal-on-scroll is a reusable action that respects `prefers-reduced-motion`.
- CSS tokens (`--navy`, `--green`, `--gold`, `--gray-warm`, ...) move to `packages/ui` as global custom properties mapped into the Skeleton theme; component styles are scoped.
- **As built (2026-10-12)**: the two legacy pages have different chrome (full nav and footer on home; compact green header and footer on the Durham page), so they are two route groups, `(home)` and `(guide)`, each with its own layout, instead of one shared layout. Legacy marketing variable names live in `apps/marketing/src/lib/styles/tokens.css`, mapped to the Skeleton theme, with `light-dark()` surface tokens for dark mode. Marketing buttons are `Button.svelte` (not Skeleton's `.btn`).
- **Kit 3**: no `svelte.config.js` (options go to `sveltekit()` in `vite.config.ts`), `$lib` is `#lib` (package.json `imports`), env vars are declared in `src/env.ts` and read from `$app/env/public`, and the service worker uses `$app/manifest`, `$app/env` and `$app/paths`.



#### Feature: Faithful port of home and Durham pages

**Priority**: Must-Have | **Roles**: Visitor

**Description**:
Port all 22 home sections (`home`, `assessment`, `coaching-built-around-you`, `who-i-coach`, `lessons`, `development`, `results`, `why-trey`, `practice-purpose`, `technology`, `club-fitting`, `junior`, `lesson-experience`, `about`, `testimonials`, `pricing`, `other-coaching`, `faq`, `book`, `locations`, `contact`, `newsletter`) and the full Durham page with identical copy, anchors, and behavior. Pricing tiers, programs, testimonials, and FAQ move to typed modules in `src/lib/content/`.

**Acceptance Criteria**:

```gherkin
Scenario: Anchors preserved
  Given a deep link such as /#pricing or /#book
  When opened on the new site
  Then the page scrolls to the matching section

Scenario: Booking form fallback unchanged
  Given the booking form is filled with name, email, phone, lesson type, preferred date/time, and message
  When the visitor submits
  Then the browser opens a mailto: to thornockgolf@gmail.com with subject "Lesson Request: <type>" and all fields in the body
  And no success message implies a server received the request

Scenario: Pricing tabs
  Given the pricing section
  When a tab is selected
  Then only its panel is visible, the tab has the active state, and it is keyboard-operable

Scenario: External booking links
  Given any "Book" CTA
  When clicked
  Then it opens Dick's scheduling URL in a new tab with rel="noopener"

Scenario: Missing asset
  Given an image fails to load
  When the page renders
  Then layout does not shift and alt text is present
```

**Technical Notes**:

- Copy text verbatim; do not rewrite marketing copy in the port.
- Phone, email, address, and scheduling URL live in one `siteConfig` (in `packages/shared`), which also feeds JSON-LD and footer.
- Fonts: self-host Poppins and Inter subsets (`font-display: swap`) so they work offline and remove the Google Fonts request.
- Images (`img-01..13`, 2.1 MB total, `img-03.jpg` 413 KB): responsive WebP/AVIF with explicit `width`/`height`, lazy below the fold, hero eager.



#### Feature: SEO and URL continuity

**Priority**: Must-Have | **Roles**: Visitor, search engines

**Acceptance Criteria**:

```gherkin
Scenario: Old Durham URL
  Given a request to /golf-lessons-durham.html
  When Netlify serves it
  Then it returns a 301 to /golf-lessons-durham and the canonical points to the final URL

Scenario: Metadata parity
  Given each page
  When the built HTML is inspected
  Then it has the same <title>, meta description, canonical, and LocalBusiness JSON-LD (name, address 6910 Fayetteville Road Durham NC 27713, telephone, email, areaServed) as today

Scenario: Crawlability
  Given the deployed site
  When /sitemap.xml and /robots.txt are requested
  Then both exist and list the live pages
```

**Technical Notes**: `_redirects`/`netlify.toml` for `.html` to clean-URL 301s; `trailingSlash: 'never'`; JSON-LD from `<svelte:head>` using `siteConfig`; Open Graph tags are included (built); CSP script-src uses SvelteKit `kit.csp` hash mode; update `README.md` after cutover.

#### Feature: Netlify deployment

**Priority**: Must-Have

**Acceptance Criteria**:

```gherkin
Scenario: Production deploy
  Given Netlify is relinked to the monorepo with base apps/marketing
  When a commit lands on main touching apps/marketing or packages
  Then Netlify builds and publishes with no manual step

Scenario: App-only push
  Given a commit touching only apps/app
  When it lands on main
  Then the Netlify build is skipped

Scenario: Rollback
  Given a bad deploy
  When the previous Netlify deploy is restored
  Then the prior version is live within minutes
```

**Technical Notes**: `netlify.toml` in `apps/marketing` (built; untested on Netlify: the build command runs `bun install --frozen-lockfile && bun run build`, so confirm Netlify has Bun) with build command, publish dir, security headers (`X-Content-Type-Options`, `Referrer-Policy`, a CSP compatible with self-hosted fonts and inline JSON-LD), and the ignore command. Requires Trey's Netlify access to relink.

### 3.A.2 PWA Compatibility (item 2)



#### Feature: Manifest and icons

**Priority**: Must-Have

**Description**: `manifest.webmanifest` (name "Trey Thornock Golf", `display: standalone`, `start_url: /`, brand `theme_color`/`background_color`). Only `img-01.png` (40 KB) exists, so 192, 512, maskable 512, and Apple touch icons are generated from it.

**Acceptance Criteria**:

```gherkin
Scenario: Installable
  Given the deployed site over HTTPS
  When Lighthouse checks installability
  Then the manifest is valid, 192 and 512 icons resolve, and a service worker controls the page

Scenario: iOS home screen
  Given Safari on iOS
  When the visitor chooses Add to Home Screen
  Then the apple-touch-icon and title are used and the site opens without browser chrome
```



#### Feature: Service worker and offline fallback

**Priority**: Must-Have

**Description**: SvelteKit's `src/service-worker.ts` with versioned caches. HTML is network-first with cache fallback so pricing never goes stale; hashed assets, fonts, and images are cache-first. `/offline` is shown when a navigation fails with nothing cached.

**Acceptance Criteria**:

```gherkin
Scenario: Offline revisit
  Given the home page was loaded once
  When reopened with no network
  Then the cached home page renders

Scenario: Offline first-time route
  Given a never-visited route and no network
  When requested
  Then /offline shows the phone number and email as plain links

Scenario: Update delivery
  Given a new deploy changes assets
  When the visitor next has a connection
  Then old caches are deleted on activate and fresh HTML is fetched

Scenario: No cross-origin caching
  Given requests to Dick's scheduling, Google Maps, or the app subdomain
  When made
  Then the service worker does not intercept or cache them
```

**Technical Notes**: Production builds only; never precache `app.` links; document an unregister/cache-bust recovery step in `README.md`. The app has its own PWA scope (Part B).

### 3.A.3 Landing Page Reorganization (item 3)



#### Feature: Reorganize information architecture and flow

**Priority**: Should-Have (explicitly lower priority per roadmap; after items 1 and 2 ship)

**Description**: Reduce the 22-section home to a decision funnel and move long-form detail to its own pages. Proposed IA (needs Trey's approval):


| Route                  | Purpose                                                                                     | Draws from current sections                                                                  |
| ---------------------- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `/`                    | Hero, assessment CTA, programs summary, results/testimonials, about teaser, one booking CTA | home, assessment, lessons (summary), results, testimonials, about (short)                    |
| `/golf-lessons-durham` | Local SEO page                                                                              | unchanged                                                                                    |
| `/programs`            | Programs, development system, who I coach, lesson experience, technology                    | lessons, development, who-i-coach, lesson-experience, technology, why-trey, practice-purpose |
| `/junior`              | Junior golf                                                                                 | junior                                                                                       |
| `/club-fitting`        | Club fitting                                                                                | club-fitting                                                                                 |
| `/pricing`             | Pricing tabs, online and private coaching                                                   | pricing, other-coaching                                                                      |
| `/about`               | About Trey, results                                                                         | about, results                                                                               |
| `/contact`             | Booking form, locations, FAQ, newsletter                                                    | book, locations, faq, newsletter                                                             |


**Acceptance Criteria**:

```gherkin
Scenario: Single primary CTA
  Given any page on mobile
  When viewed
  Then one primary booking/assessment CTA is visible per screen of content, and Book and Sign In sit in consistent nav positions

Scenario: Old anchors still work
  Given an old link such as /#pricing
  When opened
  Then the visitor is redirected to /pricing

Scenario: No lost content
  Given the old home content inventory
  When the new site is reviewed
  Then every section is present on the new routes or explicitly marked removed in the PR
```

**Technical Notes**: Sections move as components, so earlier work is reused. Hash anchors cannot be redirected server-side; add a client-side legacy `#section` map.

### 3.A.4 App Entry Links (item 4, link only)



#### Feature: Sign In / Get Started links

**Priority**: Must-Have | **Roles**: Visitor, Player, Coach

**Description**: Plain links in desktop nav, mobile menu, and footer to `/sign-in` and `/sign-up` on `app.treythornockgolf.com`. The marketing site does not load Clerk, read sessions, or set auth cookies.

**Acceptance Criteria**:

```gherkin
Scenario: App is live
  Given PUBLIC_APP_URL is set and PUBLIC_SHOW_APP_LINKS is "true"
  When the visitor clicks Sign In or Get Started
  Then they navigate to the app subdomain sign-in or sign-up route

Scenario: App not live yet
  Given PUBLIC_SHOW_APP_LINKS is not "true"
  When the site is built
  Then no Sign In / Get Started links are rendered
```

**Technical Notes**: `$env/static/public`; paths kept in `siteConfig` (the app implements `/sign-in` and `/sign-up` in Part B).

---



# PART B: App Foundation (items 4, 7)



### 3.B.1 Auth, roles, and app shell



#### Feature: Clerk sign in / sign up and role resolution

**Priority**: Must-Have | **Roles**: Both
**Service**: One-on-One Coaching

**Description**:
Clerk (hosted) handles sign-in/up at `app.` Each request is verified in `hooks.server.ts` (Clerk session token), producing `CurrentUser { clerkUserId, role }`. Role is `coach` or `player`, stored in `users.role` (Postgres) and set by the app server, never by the client. Trey's Clerk user ID is the only coach at launch, provisioned via a one-time seed/ allowlist (`COACH_CLERK_USER_IDS` env). A first sign-in creates the `users` row as `player`.

**Acceptance Criteria**:

```gherkin
Scenario: New player signs up
  Given a visitor completes Clerk sign-up
  When they land on the app for the first time
  Then a users row exists with their clerk_user_id and role "player"

Scenario: Coach is resolved
  Given Trey's Clerk user ID is in COACH_CLERK_USER_IDS
  When he signs in
  Then CurrentUser.role is "coach" and /coach routes load

Scenario: Unauthenticated access
  Given no session
  When any route except /sign-in, /sign-up, /webhooks/* is requested
  Then the user is redirected to /sign-in (HTML) or receives 401 (API)

Scenario: Player hits a coach route
  Given a signed-in player
  When they request /coach or a coach-only API
  Then the response is 403 and nothing is leaked
```

**Technical Notes**: `Clerk` Effect service verifies tokens; `runRoute` maps `NotAuthenticated`/`Forbidden`. Confirm Clerk's SvelteKit SDK works on Bun (checklist item); fall back to `@clerk/backend` verification if not.

#### Feature: App shell and PWA

**Priority**: Must-Have | **Roles**: Both

**Description**: Skeleton-based layout (app bar, bottom nav on mobile, side nav on desktop), installable PWA with its own scope (`app.` origin), service worker caching the shell only; API and media responses are never cached by the service worker.

**Acceptance Criteria**:

```gherkin
Scenario: Installed app offline
  Given the app is installed and the network is lost
  When it opens
  Then the shell loads and shows an offline banner with disabled upload/chat actions
  And no stale API data is shown as current

Scenario: Update
  Given a new app deploy
  When the app next loads online
  Then the new version activates on next navigation and a toast offers "Reload"
```



### 3.B.2 Data model and deploy



#### Feature: Schema and migrations

**Priority**: Must-Have | **Roles**: Both

**Description**: Migrations in `packages/db` (plain SQL, forward-only, applied on deploy). Entities in section 4. Postgres is Supabase's; app and worker connect with a server-side role over the internal Docker network, never exposed to browsers.

**Acceptance Criteria**:

```gherkin
Scenario: Migrate from empty
  Given an empty database
  When migrations run
  Then all tables, indexes, and constraints exist and the run is idempotent on rerun

Scenario: Referential integrity
  Given a video row
  When its owner is deleted
  Then deletion is blocked unless the account-deletion job removes dependents first
```



#### Feature: Deploy app and worker on Coolify

**Priority**: Must-Have

**Description**: `apps/app` built with `@sveltejs/adapter-node` and run on Bun (`bun build/index.js`) and `apps/worker` as two Coolify applications from the org repo, base directories `apps/app` and `apps/worker`, watch paths limited to the app plus `packages`, Docker context at the repo root so workspace packages resolve. App at `app.treythornockgolf.com` with HTTPS; worker has no public port.

**Acceptance Criteria**:

```gherkin
Scenario: Push deploys
  Given a commit touching apps/app or packages
  When it lands on main
  Then Coolify rebuilds and redeploys the app with a passing health check at /healthz

Scenario: Failed health check
  Given a build whose /healthz fails
  When Coolify deploys
  Then the previous container keeps serving
```

---



# PART C: Video (items 5 playback basics, 6, 13)



### 3.C.1 Upload



#### Feature: Direct-to-R2 upload with Uppy

**Priority**: Must-Have | **Roles**: Player (own videos), Coach (reference/analysis videos)
**Service**: One-on-One Coaching

**Description**: The player picks or records a swing clip (camera capture on mobile). The app issues a presigned PUT (multipart for large files) after validating type and size. The browser uploads straight to R2 via Uppy (progress, retry, resumable). On completion the client calls `POST /api/videos/:id/complete`; the app verifies the object exists in R2 (HEAD), sets status `uploaded`, and enqueues `video.uploaded`.

**User Story**: As a Player, I want to upload a swing clip from my phone and see progress so I know it arrived.

**Acceptance Criteria**:

```gherkin
Scenario: Successful upload
  Given a signed-in player and a 60 s 1080p MP4 under the size limit
  When they upload it
  Then bytes go directly to R2 (no request body to the app server above 1 MB)
  And a videos row moves pending -> uploaded -> processing -> ready

Scenario: Flaky network
  Given the connection drops at 40%
  When it returns
  Then Uppy resumes the multipart upload without restarting

Scenario: Invalid file
  Given a non-video file or a file over the limit
  When the player selects it
  Then the presign request is rejected with 422 and a readable message

Scenario: Fake completion
  Given a client calls /complete for an object that does not exist in R2
  When the app HEADs the key
  Then it returns 409 and enqueues nothing

Scenario: Cross-user presign
  Given player A requests an upload for player B's id
  When the request is made
  Then it is 403
```

**Technical Notes**:

- Limits: MP4/MOV/WebM, <= 500 MB, <= 5 min (configurable constants in `packages/shared`).
- Presigned URL TTL 15 min, key fixed server-side (`raw/{video_id}/source.{ext}`), content-type and length conditions where R2 supports them.
- R2 bucket CORS must allow the app origin(s) for PUT/POST/HEAD with `ETag` exposed.
- Upload state in the UI is a small Svelte runes store wrapped around the Uppy instance. As built: `@uppy/core` 6 with a small custom uploader plugin, because `@uppy/aws-s3` 6.x no longer supports our server-signed flow; the app server creates, lists, completes and aborts multipart uploads itself and only presigns the byte PUTs.



### 3.C.2 Processing



#### Feature: ffmpeg transcode and thumbnail worker

**Priority**: Must-Have | **Roles**: system

**Description**: `apps/worker` consumes `video.uploaded`: downloads the source from R2, transcodes to H.264/AAC MP4 (faststart, 1080p max, constant frame rate, keyframe every 0.5 s so scrubbing is precise), generates a poster thumbnail and a scrub-preview sprite, uploads outputs, probes duration/fps/dimensions, and updates Postgres. The **source file is never deleted**.

**Acceptance Criteria**:

```gherkin
Scenario: Happy path
  Given a video in status uploaded
  When the worker completes
  Then processed MP4, thumbnail, and probe metadata are stored, status is "ready", and a Realtime event notifies the owner

Scenario: Corrupt file
  Given an unreadable source
  When ffmpeg fails
  Then pg-boss retries up to 3 times with backoff, then status is "failed" with an error code, and the player sees "We couldn't process this video. Try re-uploading."

Scenario: Worker crash
  Given the worker dies mid-job
  When it restarts
  Then the job is retried (pg-boss expiry) and outputs are overwritten idempotently

Scenario: Source retained
  Given any processed video
  When R2 is inspected
  Then raw/{id}/source.* still exists
```

**Technical Notes**: Concurrency 1-2 jobs to fit 4 vCPU; ffmpeg runs with a timeout and `-threads` cap; temp files in a size-limited volume cleaned on completion.

### 3.C.3 Playback and download



#### Feature: video.js player with frame-accurate scrubbing

**Priority**: Must-Have | **Roles**: Both (player: own videos; coach: assigned players' videos)

**Description**: video.js player with custom Skeleton-styled controls: scrub bar, frame step (1/fps) forward/back, slow-motion rates (0.1x-2x), and **auto-replay on end** (toggle, default on). Playback URLs are short-lived signed R2 GET URLs issued by the app after an access check.

**Acceptance Criteria**:

```gherkin
Scenario: Auto replay
  Given auto-replay is on
  When the video ends
  Then it restarts from 0 without user input

Scenario: Frame step
  Given a paused video at fps 60
  When the user presses the step-forward control or the right arrow
  Then currentTime advances by 1/60 s

Scenario: Access
  Given a player requests another player's video
  When the app checks ownership
  Then it responds 403 and issues no URL

Scenario: Coach access
  Given a coach and a video of a player assigned to them
  When they open it
  Then a signed URL is issued

Scenario: Expired URL
  Given a signed URL that expired during playback
  When the player errors
  Then the client fetches a new URL and resumes at the same time
```

**Technical Notes**: Signed GET TTL 1 h; keyboard-accessible controls with labels; `playsinline` for iOS.

#### Feature: Download videos (item 13)

**Priority**: Must-Have | **Roles**: Player (own), Coach (assigned players')

**Acceptance Criteria**:

```gherkin
Scenario: Download processed or original
  Given an authorized user on a ready video
  When they choose Download
  Then they can pick "Processed (MP4)" or "Original" and a signed URL with Content-Disposition attachment is issued

Scenario: Unauthorized download
  Given a user without access
  When they request a download URL
  Then it is 403
```

---



# PART D: Analysis (items 5, 8, 9)



### 3.D.1 Annotations



#### Feature: Draw on video with Fabric.js

**Priority**: Must-Have | **Roles**: Coach (create/edit/delete); Player (view, and draw on own videos as Should-Have)
**Service**: One-on-One Coaching

**Description**: A Fabric.js canvas overlays the video. Tools: line, arrow, circle, angle, freehand, text, color, undo/redo, clear. Each annotation is stored as **JSON (Fabric object serialization +** `start_ms` **+** `end_ms`**)** in Postgres and **never burned into video pixels**. Coordinates are normalized (0-1 of video width/height) so they stay correct at any display size. During playback an annotation shows only between `start_ms` and `end_ms`.

**Acceptance Criteria**:

```gherkin
Scenario: Draw and persist
  Given a coach paused at 2.4 s
  When they draw an arrow and save
  Then an annotations row exists with start_ms 2400, normalized shape JSON, and author coach

Scenario: Playback
  Given an annotation covering 2400-4000 ms
  When playback passes those times
  Then it appears and disappears on cue at any viewport size

Scenario: Player cannot edit coach annotations
  Given a player viewing a coach annotation
  When they try to edit or delete it
  Then the API returns 403

Scenario: Concurrent edit
  Given two sessions edit the same annotation
  When the second saves with a stale updated_at
  Then the API returns 409 and the client reloads the latest
```

**Technical Notes**: Payload validated with Effect Schema (allowlisted shape types and properties, size cap) so stored JSON cannot inject arbitrary content. Canvas size follows the video element via ResizeObserver. **As built**: the stored JSON is our own small shape format (`line`, `arrow`, `circle`, `angle`, `freehand`, `text`; `packages/shared/src/annotations.ts`), not raw Fabric serialization; Fabric only renders it. Concurrency uses the integer `version` rather than `updated_at`. Edits go to `/api/videos/:id/annotations/:annotationId`. Limits: 16 KB per shape, 500 freehand points, 100 annotations per video. Coach-only for now (players drawing on their own videos is deferred).

### 3.D.2 Compare and overlay



#### Feature: Side-by-side compare with independent sliders (item 5)

**Priority**: Must-Have | **Roles**: Both

**Description**: Two video.js players side by side: a pro reference video and the player's swing (or any two of the player's videos). Each has its own scrub slider; a Sync toggle links play/pause/seek/rate and keeps them aligned from a chosen **sync point** (e.g. address or impact frame) per video.

**Acceptance Criteria**:

```gherkin
Scenario: Independent scrub
  Given Sync is off
  When the user drags the left slider
  Then only the left video seeks

Scenario: Synchronized playback
  Given Sync is on with sync points set
  When the user plays or scrubs either video
  Then both stay aligned relative to their sync points within one frame

Scenario: Different lengths
  Given videos of different durations
  When the shorter ends
  Then it holds its last frame (or loops if auto-replay) while the other continues

Scenario: Reference library access
  Given pro reference videos are coach-managed
  When a player opens Compare
  Then they can choose from the reference library but cannot edit it
```

**Technical Notes**: Pro reference videos are stored like any video (`videos.kind = 'reference'`, owned by the coach, visible to everyone signed in) and pass through the same upload and worker pipeline. Real pro footage is deferred: build against a labeled placeholder clip and swap in licensed footage later (Assumptions).

#### Feature: Overlay one video on another (item 9)

**Priority**: Should-Have | **Roles**: Both

**Description**: Place a second video (pro or the player's previous swing) over the first at adjustable opacity, scale, and position, with the same sync point controls as Compare.

**Acceptance Criteria**:

```gherkin
Scenario: Overlay
  Given a base video and an overlay video
  When the user sets opacity 50% and aligns sync points
  Then both play in sync with the overlay at 50% opacity

Scenario: Save overlay setup
  Given the coach adjusts position and scale
  When they save
  Then the settings persist in the analysis so the player sees the same view
```



### 3.D.3 Coach re-record (item 8)



#### Feature: Coach analysis recording with partial re-record

**Priority**: Must-Have | **Roles**: Coach only
**Service**: One-on-One Coaching

**Description**: The coach records spoken analysis over a player's video (microphone, plus optional camera) in the browser using MediaRecorder. An analysis is a timeline of ordered **segments**; each segment is its own recorded clip in R2 with `start_ms`/`end_ms` on the analysis timeline. **Re-recording a range replaces only the segments overlapping that range**; segments and annotations outside it are untouched. Annotations are independent rows keyed to timeline timestamps, which is why this works.

**Acceptance Criteria**:

```gherkin
Scenario: Re-record middle of an analysis
  Given an analysis with segments covering 0-30 s
  When the coach re-records 10-15 s
  Then segments covering 0-10 s and 15-30 s keep their R2 objects unchanged
  And a new segment for 10-15 s is stored and the timeline re-assembles with no gap

Scenario: Annotations outside the range
  Given annotations at 3 s and 22 s
  When 10-15 s is re-recorded
  Then both annotations are unchanged

Scenario: Annotations inside the range
  Given an annotation at 12 s
  When 10-15 s is re-recorded
  Then the coach is asked to keep (default) or remove it before saving

Scenario: Player cannot re-record
  Given a player
  When they call the re-record API
  Then it returns 403

Scenario: Failed upload of the new segment
  Given the new segment upload fails
  When the coach retries or cancels
  Then the previous segments remain the live analysis
```

**Technical Notes**:

- Job `analysis.assemble` (pg-boss) concatenates segments with ffmpeg only when a single flattened playback file is needed; the player can alternatively play segments sequentially from a manifest. Decision: **manifest-based playback first** (no re-encode), flattened export for download as Could-Have.
- Segments keep their source recordings; superseded segments are marked `replaced_at` and retained for undo for 30 days.
- Browser support: MediaRecorder container differs by browser (WebM vs MP4); the worker normalizes every segment to MP4/AAC.

---



# PART E: Communication, Payments, Profile (items 10, 11, 12)



### 3.E.1 Chat and notifications (item 12)



#### Feature: Coach-player chat

**Priority**: Must-Have | **Roles**: Both (only the two participants in a conversation)

**Description**: One conversation per coach-player pair. Messages are text with optional reference to a video and timestamp (tap to jump). **Writes go through the app server to Postgres**; Supabase Realtime pushes new rows to subscribers of the conversation channel.

**Acceptance Criteria**:

```gherkin
Scenario: Send and receive
  Given player and coach both have the conversation open
  When the player sends a message
  Then it is stored via POST /api/conversations/:id/messages and appears for the coach within 1 s

Scenario: Non-participant
  Given a user who is not in the conversation
  When they request its messages or subscribe to its channel
  Then access is denied

Scenario: Reconnect
  Given the Realtime socket drops
  When it reconnects
  Then missed messages are fetched by id cursor and no duplicates appear

Scenario: Message with video reference
  Given a message referencing video V at 3200 ms
  When the recipient taps the reference
  Then the player opens V at 3.2 s

Scenario: Unpaid player
  Given a player who has not paid for the assessment or has no active membership
  When they try to send a message
  Then the API returns 402 with a link to billing
```

**Technical Notes**:

- Realtime authorization: the app server mints a short-lived (<= 5 min) Supabase-signed JWT after verifying Clerk, scoped to one conversation. A minimal channel-authorization policy on the Realtime schema checks that claim. This is the **only** database-side auth, kept to the channel layer.
- Message length cap 4,000 chars, rate limit 30 msg/min per user.
- Status events (`video.ready`, `video.failed`) use the same Realtime mechanism on a per-user channel.



#### Feature: Notifications

**Priority**: Should-Have (in-app), Could-Have (push)

**Description**: In-app unread badges and a notifications list (new message, video ready, analysis ready, plan assigned, payment issue), driven by a `notifications` table plus Realtime. Web Push for the installed PWA is a Could-Have; email is not in the stack and out of scope.

**Acceptance Criteria**:

```gherkin
Scenario: Unread badge
  Given a new message arrives while the recipient is on another screen
  When the event is delivered
  Then the nav badge increments and clears when the conversation is opened

Scenario: Missed while offline
  Given the recipient was offline
  When they open the app
  Then unread counts come from Postgres and are correct
```



### 3.E.2 Payments (item 10)



#### Feature: Stripe Checkout, Customer Portal, webhooks

**Priority**: Must-Have | **Roles**: Player (subscribe/manage); Coach (view status)
**Service**: One-on-One Coaching (the only paid product at launch)

**Description**: Two Stripe products from the "Online Coaching" pricing on `index.html` (test mode first): the **Initial Performance Assessment**, a $149 one-time payment, and the **Ongoing Golf Performance Coaching Membership**, $49/month. The membership is offered after the assessment is paid (the site describes it as following the assessment). `POST /api/billing/checkout` creates a Checkout session (mode `payment` or `subscription`) for the signed-in player; the Customer Portal handles card changes and cancellation. `POST /webhooks/stripe` (raw body, signature-verified, no Clerk session) is the **only** thing that writes subscription and payment state; the client never reports payment success. Stripe account setup is an external dependency.

**Acceptance Criteria**:

```gherkin
Scenario: Subscribe
  Given a player without a subscription
  When they complete Checkout
  Then checkout.session.completed and customer.subscription.* webhooks set subscriptions.status to "active"
  And the app unlocks coaching features on the next request

Scenario: Forged webhook
  Given a request with an invalid Stripe-Signature
  When it hits /webhooks/stripe
  Then it returns 400 and writes nothing

Scenario: Duplicate delivery
  Given Stripe resends an event
  When processed again
  Then it is ignored by event id (idempotent)

Scenario: Payment fails
  Given invoice.payment_failed
  When processed
  Then status becomes "past_due", the player sees a banner, and chat sending is blocked after the grace period

Scenario: Success page spoof
  Given a user manually opens the success URL without paying
  When the page loads
  Then access is unchanged because it reads subscription state from Postgres only
```

**Technical Notes**: Store `stripe_customer_id`, subscription id, price id, period end; log every webhook event in `stripe_events` (id unique) for idempotency and audit. Checkout and Portal return URLs on `app.`. Prices come from `index.html` (`#other-coaching`) and live in Stripe, not in code; the app reads price IDs from env.

### 3.E.3 Player profile (item 11)



#### Feature: Player profile page

**Priority**: Must-Have | **Roles**: Player (own, editable); Coach (assigned players, read + coach notes)

**Description**: Integrate the existing `user-profile.html` design into the app: handicap, goals, home course, dominant hand, equipment, injuries/limitations, profile photo (R2), and a summary of videos, current plan, and subscription status. Coach sees the same page plus private coach notes.

**Acceptance Criteria**:

```gherkin
Scenario: Edit own profile
  Given a player on /profile
  When they update handicap and save
  Then the value persists and validates numeric range (-10 to 54)

Scenario: Coach notes are private
  Given a coach note on a player
  When the player loads their profile or the API
  Then the note is absent from the response

Scenario: Photo upload
  Given a profile photo upload
  When it completes
  Then it goes through the same presigned R2 flow with image type/size limits
```

---



# PART F: Questionnaire, Practice Plans, Calendar (items 14, 15, 16)



### 3.F.1 Structured intake questionnaire (item 14)



#### Feature: Swing intake questionnaire

**Priority**: Must-Have | **Roles**: Player
**Service**: Both (feeds the coach profile now; the plan generator later)

**Description**: Replace the open-ended intake with **structured questions**: handicap and experience, typical miss (ball flight, contact, direction by club), when it happens (driver/irons/wedges/putting/pressure), pain or limitations, goals (select from a list plus a target), time available per week, and optional free text. Taken from the existing diagnostic logic and `rules` in `index-trey-website.html`; question content lives as typed config in `packages/shared`. Answers are stored as versioned JSON so questions can evolve.

**Acceptance Criteria**:

```gherkin
Scenario: Complete questionnaire
  Given a new player
  When they answer all required questions
  Then a questionnaire_responses row stores the version and answers and the coach sees it on the player's profile

Scenario: Resume
  Given a partially completed form
  When the player returns
  Then answers are restored from the saved draft

Scenario: Validation
  Given a required question is unanswered
  When the player submits
  Then the form shows the specific missing question and does not save

Scenario: Re-take
  Given a player who has an earlier response
  When they retake it
  Then a new versioned response is created and the old one is kept
```



### 3.F.2 Practice plans and calendar (items 15, 16)



#### Feature: Coach-authored practice plans

**Priority**: Must-Have | **Roles**: Coach (create/assign/edit); Player (view, check items off)
**Service**: One-on-One Coaching

**Description**: Migrate the existing plan content and drills (from `index-trey-website.html`: sections, timed drills with setup, steps, cues, success criteria, common mistake, progression, regression) into Postgres as a drill library plus plan templates. The coach composes a plan (ordered sessions of drills with durations), assigns it to a player with dates, and the player marks items complete.

**Acceptance Criteria**:

```gherkin
Scenario: Assign a plan
  Given a coach builds a plan from drills
  When they assign it to a player starting on a date
  Then plan_assignments and scheduled sessions exist and the player is notified

Scenario: Player completes an item
  Given an assigned session
  When the player marks a drill complete
  Then completion is stored with a timestamp and the coach sees progress

Scenario: Permission
  Given a player calls the plan authoring API
  When processed
  Then it returns 403

Scenario: Session totals
  Given 30, 45, 60, and 90 minute sessions
  When a plan is built from drills
  Then drill durations sum exactly to the session length (parity with the existing verifier)
```



#### Feature: Calendar view for plans, check-ins, and assessments (item 15)

**Priority**: Should-Have | **Roles**: Both

**Description**: Month/week/list calendar showing practice sessions, check-ins (short player self-report: rounds played, issues, confidence, optional video link), and tests/assessments (coach-defined measurable tests with recorded results over time).

**Acceptance Criteria**:

```gherkin
Scenario: Calendar render
  Given sessions, a check-in, and an assessment scheduled in one week
  When the player opens the calendar
  Then all three appear on the correct days with distinct labels, usable at 360 px width

Scenario: Submit check-in
  Given a scheduled check-in
  When the player submits it
  Then the coach is notified and it appears in the player's history

Scenario: Record assessment result
  Given a scheduled assessment
  When the coach records a result
  Then the player sees the value and a trend vs. previous results
```



#### Feature: Self-serve intake to generated plan (item 16a)

**Priority**: Could-Have (deferred) | **Roles**: Player
**Service**: Intake/Practice Plan

**Description**: Generating a plan automatically from questionnaire answers using the existing rules/drills taxonomy. Per the checklist decision, only 1:1 coaching is sold at launch, so this ships after the coaching product and is not tied to payment in this spec. When built, generation is rule-based on the server using the shared rules; any AI layer calls from the server only and validates its output against the rules.

---



## 4. Data Model (Postgres)

All tables have `id uuid PK default gen_random_uuid()`, `created_at`, `updated_at`. Rows are scoped by Clerk user ID. Video bytes live in R2; tables hold keys and metadata only.


| Table                                | Key fields                                                                                                                                                                                                                                            | Notes                                  |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| `users`                              | `clerk_user_id` (unique), `role` (player/coach), `display_name`, `email`                                                                                                                                                                              | One row per Clerk user                 |
| `player_profiles`                    | `user_id` FK, `handicap`, `goals`, `home_course`, `hand`, `equipment`, `limitations`, `photo_key`                                                                                                                                                     | 1:1 with player                        |
| `coach_assignments`                  | `coach_id`, `player_id` (unique pair), `status`                                                                                                                                                                                                       | Defines which videos the coach can see |
| `coach_notes`                        | `assignment_id`, `body`                                                                                                                                                                                                                               | Never returned to players              |
| `videos`                             | `owner_id`, `kind` (swing/reference/analysis_source), `status` (pending/uploaded/processing/ready/failed), `title`, `source_key`, `processed_key`, `thumbnail_key`, `sprite_key`, `duration_ms`, `fps`, `width`, `height`, `error_code`, `size_bytes` | Source key is never deleted            |
| `analyses`                           | `video_id`, `coach_id`, `title`, `overlay_settings jsonb`                                                                                                                                                                                             | Coach analysis of a video              |
| `analysis_segments`                  | `analysis_id`, `position`, `start_ms`, `end_ms`, `clip_key`, `status`, `replaced_at`                                                                                                                                                                  | Replaced segments kept 30 days         |
| `annotations`                        | `video_id` (or `analysis_id`), `author_id`, `start_ms`, `end_ms`, `shape jsonb` (normalized), `version`                                                                                                                                               | Never burned into video                |
| `conversations`                      | `coach_id`, `player_id` (unique pair)                                                                                                                                                                                                                 |                                        |
| `messages`                           | `conversation_id`, `sender_id`, `body`, `video_id?`, `video_ms?`                                                                                                                                                                                      | Index `(conversation_id, created_at)`  |
| `notifications`                      | `user_id`, `type`, `payload jsonb`, `read_at`                                                                                                                                                                                                         | Index `(user_id, read_at)`             |
| `subscriptions`                      | `user_id`, `stripe_customer_id`, `stripe_subscription_id`, `price_id`, `status`, `current_period_end`                                                                                                                                                 | Written only by webhook handler        |
| `payments`                           | `user_id`, `stripe_invoice_id`, `amount_cents`, `currency`, `status`, `paid_at`                                                                                                                                                                       |                                        |
| `stripe_events`                      | `event_id` (unique), `type`, `processed_at`                                                                                                                                                                                                           | Idempotency                            |
| `questionnaire_responses`            | `user_id`, `version`, `answers jsonb`, `completed_at`                                                                                                                                                                                                 | Versioned                              |
| `drills`                             | `name`, `category`, `purpose`, `setup`, `steps jsonb`, `cues`, `success_criteria`, `common_mistake`, `progression`, `regression`                                                                                                                      | Migrated from existing content         |
| `practice_plans`                     | `author_id`, `title`, `structure jsonb`                                                                                                                                                                                                               | Templates                              |
| `plan_assignments`                   | `plan_id`, `player_id`, `starts_on`, `status`                                                                                                                                                                                                         |                                        |
| `plan_sessions`                      | `assignment_id`, `scheduled_on`, `duration_min`, `items jsonb`, `completed_at`                                                                                                                                                                        | Item-level completion in `items`       |
| `check_ins`                          | `player_id`, `scheduled_on`, `answers jsonb`, `submitted_at`                                                                                                                                                                                          |                                        |
| `assessments` / `assessment_results` | test definition; `player_id`, `value`, `recorded_at`                                                                                                                                                                                                  | Trend over time                        |


**Indexes**: `videos(owner_id, created_at desc)`, `annotations(video_id, start_ms)`, `analysis_segments(analysis_id, position)`, `plan_sessions(assignment_id, scheduled_on)`, `check_ins(player_id, scheduled_on)`.

### Object Storage (R2) Layout

```
raw/{video_id}/source.{ext}            original upload, retained forever
processed/{video_id}/video.mp4         H.264/AAC faststart
processed/{video_id}/poster.jpg
processed/{video_id}/sprite.jpg + sprite.vtt
analysis/{analysis_id}/{segment_id}.mp4
profile/{user_id}/photo.{ext}
```

Buckets are private; all reads use short-lived signed URLs issued after an access check.

### Job Queue (pg-boss)


| Job                         | Producer          | Consumer | Payload                       | Retry/failure                                                  |
| --------------------------- | ----------------- | -------- | ----------------------------- | -------------------------------------------------------------- |
| `video.uploaded`            | app (`/complete`) | worker   | `{ video_id }`                | 3 retries, exponential backoff, then `failed` + Realtime event |
| `analysis.segment.uploaded` | app               | worker   | `{ analysis_id, segment_id }` | Same; failure keeps previous segments live                     |
| `analysis.assemble`         | app/worker        | worker   | `{ analysis_id }`             | Optional flatten for download (Could-Have)                     |
| `retention.sweep`           | scheduled         | worker   | `{}`                          | Deletes replaced segments older than 30 days                   |




### Realtime Channels (Supabase)


| Channel             | Publishers                              | Subscribers          | Payload                              |
| ------------------- | --------------------------------------- | -------------------- | ------------------------------------ |
| `conversation:{id}` | DB insert on `messages` (via app write) | the two participants | message row                          |
| `user:{id}`         | worker, app                             | that user            | `video.ready/failed`, `notification` |


---



## 5. API / Interface Design

SvelteKit routes in `apps/app/src/routes`. Clerk session required except where noted. Role column is the check performed in the handler.


| Method                | Endpoint                          | Description                         | Role                              |
| --------------------- | --------------------------------- | ----------------------------------- | --------------------------------- |
| GET                   | /healthz                          | Coolify health check (no auth)      | none                              |
| POST                  | /api/videos                       | Create video row + presigned upload | Player (self), Coach              |
| GET                   | /api/videos                       | Caller's videos with signed posters | Signed in                         |
| POST                  | /api/videos/:id/upload-url        | Fresh presigned PUT (pending, single-request uploads) | Owner                |
| POST/GET              | /api/videos/:id/multipart/{sign-part,parts,complete,abort} | Multipart upload steps (Uppy) | Owner         |
| POST                  | /api/videos/:id/complete          | Verify object, enqueue job          | Owner                             |
| GET                   | /api/videos/:id/playback          | Signed playback URL                 | Owner or assigned Coach           |
| GET                   | /api/videos/:id/download?variant= | Signed download URL                 | Owner or assigned Coach           |
| GET/POST              | /api/videos/:id/annotations       | List / create annotation            | Coach write; Owner read           |
| PATCH/DELETE          | /api/videos/:id/annotations/:annotationId | Edit / delete (version-checked) | Coach                     |
| POST                  | /api/analyses                     | Start analysis                      | Coach                             |
| POST                  | /api/analyses/:id/segments        | Add or re-record a segment range    | Coach                             |
| GET/PUT               | /api/analyses/:id/overlay         | Overlay settings                    | Coach write; both read            |
| GET                   | /api/references                   | Reference video library             | Any signed-in                     |
| GET/POST              | /api/conversations/:id/messages   | List/send                           | Participant                       |
| POST                  | /api/realtime/token               | Mint scoped Realtime JWT            | Participant                       |
| GET/PATCH             | /api/notifications                | List/mark read                      | Self                              |
| POST                  | /api/billing/checkout             | Create Checkout session             | Player                            |
| POST                  | /api/billing/portal               | Customer Portal session             | Player                            |
| POST                  | /webhooks/stripe                  | Signature-verified webhook          | Stripe (no Clerk)                 |
| GET/PUT               | /api/profile                      | Own profile                         | Player                            |
| GET/POST              | /api/players/:id/notes            | Coach notes                         | Coach                             |
| GET/POST              | /api/questionnaire                | Draft, submit                       | Player                            |
| GET/POST/PATCH        | /api/drills, /api/plans           | Library and plans                   | Coach write; Player read assigned |
| POST                  | /api/plans/:id/assign             | Assign plan                         | Coach                             |
| PATCH                 | /api/sessions/:id/items/:itemId   | Mark complete                       | Player (own)                      |
| GET/POST              | /api/check-ins, /api/assessments  | Calendar items                      | Both (scoped)                     |


Errors: tagged Effect errors map to 401/403/404/409/422/402/500 with a stable JSON body `{ code, message }`. The worker exposes no public HTTP interface; it serves an internal-only `GET /healthz` (no published port) for the Docker health check.

---



## 6. UI/UX Requirements



### Routes / Screens


| Route                                   | Description                                         | Role   |
| --------------------------------------- | --------------------------------------------------- | ------ |
| `/sign-in`, `/sign-up`                  | Clerk components                                    | Public |
| `/`                                     | Player dashboard (latest video, plan today, unread) | Player |
| `/videos`, `/videos/new`, `/videos/:id` | Library, upload, player + annotations               | Both   |
| `/compare`, `/overlay`                  | Compare and overlay views                           | Both   |
| `/messages`, `/messages/:id`            | Chat                                                | Both   |
| `/plans`, `/calendar`                   | Assigned plans, calendar                            | Player |
| `/profile`                              | Profile                                             | Player |
| `/billing`                              | Subscription status, Portal link                    | Player |
| `/questionnaire`                        | Intake                                              | Player |
| `/coach`                                | Coach dashboard: players, new videos, unread        | Coach  |
| `/coach/players/:id`                    | Player detail, notes, videos, plan, results         | Coach  |
| `/coach/videos/:id/analyze`             | Annotate, record, re-record                         | Coach  |
| `/coach/library`                        | Drills, plan templates, reference videos            | Coach  |




### Components

- **VideoPlayer** (`packages/ui`) - video.js wrapper: frame step, rate, auto-replay, signed URL refresh.
- **AnnotationCanvas** - Fabric.js overlay, normalized coordinates, tool palette.
- **CompareView / OverlayView** - two synced players, sync-point controls, sliders.
- **AnalysisRecorder** - MediaRecorder capture, range selection, segment timeline.
- **UploadPanel** - Uppy dashboard styled with Skeleton, progress and retry.
- **ChatThread** - message list, composer, video-reference chip, Realtime subscription.
- **NotificationBell**, **PlanCalendar**, **DrillCard**, **QuestionnaireStepper**, **BillingBanner**, **RoleGuard**.
- Use Skeleton AppBar, Navigation, Tabs, Modal, Toast, Progress, Accordion, and form components wherever they fit.



### State Management

Effect services/layers for server and client data access (`VideoService`, `ChatService`, `BillingService`); Svelte runes for local UI state (player position, canvas tool, upload progress, menu state); Realtime subscriptions are wrapped as Effect `Stream`s consumed by a single runes store per channel with reconnect and cursor catch-up.

### PWA Considerations

Installable with shell-only caching. Uploads use resumable multipart so a lost connection mid-upload resumes; the UI shows queued/paused state and never reports success before `/complete`. No offline writes at MVP (chat and uploads disabled offline with a clear banner). Large media is never cached by the service worker. Camera capture and `playsinline` verified on iOS Safari and Android Chrome.

---



## 7. Non-Functional Requirements



### Performance

- Scrub latency < 100 ms; time-to-first-frame < 1.5 s on 4G for processed video; poster shown immediately.
- Marketing Lighthouse mobile >= 90, LCP < 2.5 s, CLS < 0.1.
- Processing <= 2x clip duration; queue wait < 60 s at launch load.
- App server request handlers never block on ffmpeg or large transfers.



### Security

- Clerk session verified on every request; role and ownership checked in the app server (Effect `Forbidden`).
- Presigned URLs: PUT 15 min, GET 1 h, keys server-generated, content type and size constrained.
- Stripe webhook signature verified on the raw body; idempotent by event id.
- Secrets only in Coolify/Netlify env and local `.env` (git-ignored); repo is public, so no secrets, keys, or real data are committed. Only `PUBLIC_*` variables reach browsers.
- Annotation JSON validated against an allowlist schema; message bodies escaped on render.
- Rate limits on presign, messages, and auth-adjacent routes; CSP on both apps.
- Postgres and Realtime are reachable only on the internal Docker network except the Realtime websocket endpoint.



### Accessibility

- WCAG 2.1 AA; keyboard control of play/pause, scrub, and frame step with visible focus and ARIA labels; controls reachable without hover; captions field for coach analysis (Should-Have); contrast verified per `docs/style-guide.md`; honor `prefers-reduced-motion`.



### Reliability / Observability

- pg-boss retries with backoff and failed-state visibility; `/healthz` for app and worker; structured logs via Effect Logger to stdout (Coolify); nightly Postgres backup to R2 (separate bucket) with a tested restore; Netlify rollback.



### Capacity

- Hostinger KVM 4 (4 vCPU / 16 GB / 200 GB NVMe) runs Supabase, app, and worker; worker concurrency 1-2. Disk holds transient transcodes only.
- R2 free tier (10 GB, 1M writes, 10M reads / month): assume ~40 MB source + ~25 MB processed per clip, so about 150 clips before storage billing starts; no egress fees. Plan to move to paid R2 after launch; it is inexpensive.

---



## 8. Implementation Phases



### Phase 1: Monorepo and marketing (Part A)

**Goal**: Live, installable SvelteKit marketing site in the monorepo.

- [ ] Restructure repo into Bun workspaces locally; `legacy/`
- [ ] `packages/ui` tokens and Skeleton theme; `packages/shared` `siteConfig`
- [ ] Scaffold `apps/marketing`; layout, components, typed content
- [ ] Port home and Durham; fonts, images, SEO, sitemap, redirects, `netlify.toml`
- [ ] Sign In / Get Started links behind flag
- [ ] After GitHub org: repoint `origin`, relink Netlify, side-by-side check, cutover
- [ ] PWA: manifest, icons, service worker, `/offline`; device install tests
- [ ] Landing reorganization after Trey approves IA (lower priority)



### Phase 2: App foundation (Part B)

- [ ] Verify Bun with SvelteKit, Clerk, pg-boss, Coolify build
- [ ] Scaffold `apps/app`, `apps/worker`, `packages/db`; Effect layers and `runRoute`
- [ ] Clerk auth, role resolution, app shell, app PWA
- [ ] Schema and migrations; Coolify deploy of app and worker; `/healthz`



### Phase 3: Video core (Part C)

- [ ] R2 CORS; presign + Uppy upload + `/complete`
- [ ] Worker transcode, thumbnails, status events
- [ ] video.js player, frame step, auto-replay; downloads



### Phase 4: Analysis (Part D)

- [ ] Fabric.js annotations (JSON + timestamps)
- [ ] Reference library, compare, overlay
- [ ] Coach analysis recorder, segments, re-record



### Phase 5: Communication, payments, profile (Part E)

- [ ] Stripe account, product/price, Checkout, Portal, webhooks
- [ ] Chat with Realtime, notifications
- [ ] Profile page integration



### Phase 6: Plans and intake (Part F)

- [ ] Questionnaire, drill library migration, plans and assignments
- [ ] Calendar, check-ins, assessments
- [ ] Self-serve generated plan (Could-Have)

---



## 9. Out of Scope (v1)

- Pose estimation / ML swing analysis (OpenCV + MediaPipe) - Reason: deferred post-MVP, separate Python worker consuming a new pg-boss job type. Source videos are retained for it.
- Clerk or auth UI on the marketing site - Reason: auth lives on `app.`.
- Self-serve paid intake-plan product - Reason: checklist decision, 1:1 coaching only at launch (generator is Could-Have).
- Form backend, newsletter provider, analytics on marketing - Reason: not in the roadmap; mailto retained.
- Marketing copy rewrites beyond the approved IA - Reason: content belongs to Trey.
- Multiple coaches / marketplace - Reason: single coach at launch; schema allows more.
- Email notifications, native mobile apps, live video lessons - Reason: not in the roadmap or stack.
- Flattened analysis export - Reason: manifest playback first (Could-Have).

---



## 10. Assumptions & Dependencies



### Assumptions

- `docs/roadmap.md` and `docs/ARCHITECTURE.md` agree on the marketing/app split. The "Node adapter" wording in older notes is superseded by the Bun runtime. The adapter is still `@sveltejs/adapter-node`, run with Bun, because `svelte-adapter-bun` (and its maintained fork) peers on SvelteKit 2 and only a 2.0.0-next prerelease supports Kit 3 (decided 2026-10-12).
- Trey is the only coach at launch; roles are set by an env allowlist and seeded.
- The monorepo lives in a GitHub org we own; until then all work stays local/uncommitted to Trey's `origin`.
- Phase 3 marketing IA is a proposal pending Trey's approval; the old Durham URL gets a 301 to the clean URL.
- Pro reference footage is deferred: the reference library ships with a clearly labeled placeholder clip until Trey supplies or licenses real footage. The compare and overlay features are built against the placeholder.
- Pricing is taken from `index.html`: Initial Performance Assessment $149 one-time, Ongoing Coaching Membership $49/month. In-person lesson packages at Dick's House of Sport are sold by Dick's and are not part of the app.
- Access rule (assumed, confirm with Trey): paying the assessment unlocks questionnaire, video upload, and the assessment report; the active membership unlocks ongoing video feedback, chat, check-ins, and plan updates.
- Bun is compatible with SvelteKit, Clerk, pg-boss, and the Coolify build. Verify first; fall back to Node for the worker or adapter if a blocker appears.
- Realtime auth uses a minimal channel policy (the only DB-side auth); alternative is Broadcast from the app server.
- Max clip 500 MB / 5 min; one active coaching conversation per player.



### Dependencies

- Requires: Phases 1-2 of the checklist done (accounts, VPS, Coolify, Supabase).
- External setup still open: GitHub org + owner access (Coolify GitHub App, Netlify relink); DNS for `app.` and Coolify HTTPS; Stripe account, product, and webhook endpoint; Clerk production instance; R2 CORS and buckets; Wix DNS access.
- Internal: Part A is independent of the app; Part C requires B; D requires C; Chat requires B and Realtime; Paywall gating requires Stripe; F requires B (calendar notifications require E).



### Stack Extensions Required

- **Packages/libraries**:
  - `effect`, `@effect/schema` (or Schema in `effect`), `@effect/platform`, `@effect/sql` + `@effect/sql-pg` - services, validation, DB access
  - `@sveltejs/adapter-node` - Node-compatible server for the app, run on Bun; `@sveltejs/adapter-static` - marketing
  - `@skeletonlabs/skeleton`, `@skeletonlabs/skeleton-svelte`, `tailwindcss` - UI (Skeleton requires Tailwind)
  - `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner` - R2 S3 API; `@uppy/core`, `@uppy/aws-s3`, `@uppy/dashboard` - upload
  - `video.js`, `fabric`, `pg-boss`, `stripe`, Clerk SDK, `@supabase/realtime-js`
  - `@sveltejs/enhanced-img` or `vite-imagetools`, `@fontsource/poppins`, `@fontsource/inter` - marketing assets
  - Vitest, Testing Library, Playwright, a link checker; Lighthouse CI optional
- **New vendor integrations**: none beyond the fixed stack (Stripe account to be created).
- **Infrastructure**: ffmpeg in the worker Docker image; a second R2 bucket for DB backups; Coolify applications for app and worker.

---



## 11. Migration & Deployment Notes

- **Repo**: restructure locally; push only after the org repo exists. Keep originals in `legacy/` until the marketing cutover is verified, then remove after a stable week.
- **Netlify**: base `apps/marketing`, publish `apps/marketing/build`, ignore command limiting builds to `apps/marketing` and `packages`; env `PUBLIC_APP_URL`, `PUBLIC_SHOW_APP_LINKS`. After deploy submit the sitemap in Search Console.
- **Coolify**: app and worker applications, base directories `apps/app` and `apps/worker`, watch paths limited to each plus `packages`, Docker context at repo root, health check `/healthz`.
- **Postgres**: forward-only SQL migrations in `packages/db`, run on app deploy before traffic switches; backups before each migration.
- **Environment variables**: `CLERK_`* (publishable, secret), `COACH_CLERK_USER_IDS`, `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_JWT_SECRET`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID_ASSESSMENT`, `STRIPE_PRICE_ID_MEMBERSHIP`, `PUBLIC_APP_URL`, `PUBLIC_SHOW_APP_LINKS`. `.env` stays out of git; dev uses Clerk dev instance, Stripe test keys, the real R2 buckets, and local Postgres in Docker (or VPS Supabase for Realtime).
- **Rollback**: Netlify previous deploy; Coolify previous image; migrations forward-fix (restore from backup only for data loss).

---



## Appendix



### Glossary

- **Marketing site**: public pages at `treythornockgolf.com`, static on Netlify.
- **App**: the coaching product at `app.treythornockgolf.com`.
- **Analysis**: a coach's recorded commentary and annotations on a player's video.
- **Segment**: one recorded clip within an analysis timeline; the unit that re-record replaces.
- **Sync point**: a per-video timestamp (e.g. impact) used to align compare and overlay.
- **Effect**: TypeScript library used for services, typed errors, schemas, and side effects.
- **Skeleton**: Svelte UI component library on Tailwind.
- **pg-boss**: Postgres-backed job queue.



### Related Documentation

- `docs/roadmap.md`
- `docs/ARCHITECTURE.md`
- `docs/checklist.md`
- `README.md`

