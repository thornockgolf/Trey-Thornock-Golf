# Marketing Site (SvelteKit + PWA) - Application Specification

> Generated: 2026-10-06
> Status: Draft
> Extends: Trey Thornock Golf platform (see roadmap.md, ARCHITECTURE.md)
> Roadmap items: 1, 2, 3 (and the link-only part of 4)
> Service: Marketing site

---

## 1. Executive Summary

### Problem Statement
`treythornockgolf.com` is two hand-written, self-contained HTML files (`index.html` ~113 KB, `golf-lessons-durham.html` ~70 KB) with the nav, footer, styles, and scripts duplicated per page and no build step. That blocks the planned app: there is no shared layout or component base, no PWA support, and no clean place to link visitors into the coaching app. The long single-page home (22 sections) also has an unplanned flow.

### Solution Overview
Rebuild the marketing site as a SvelteKit project using the static adapter, deployed to Netlify from this repo. Port the existing pages faithfully first (same URLs, copy, SEO metadata, behavior), then make the site PWA-compatible (manifest, icons, service worker, offline fallback), then reorganize the landing page flow. "Sign In / Get Started" links point to `app.treythornockgolf.com`; no auth code lives on the marketing site.

### Target Users
- **Visitor (prospective player/parent)**: wants to understand programs and pricing, book a lesson at Dick's House of Sport in Durham, or start the performance assessment. Mostly mobile.
- **Coach (Trey)**: wants to edit copy and pricing without duplicating changes across pages.
- **Returning player/coach**: wants a clear Sign In link to the app.

### Success Metrics
- Every URL that is indexed today still resolves (200 or one 301) after cutover; zero 404s in a crawl of the old URL list.
- Lighthouse (mobile) on home and Durham pages: Performance >= 90, Accessibility >= 95, SEO = 100, Best Practices >= 95; PWA installability checks pass.
- Home page HTML+JS+CSS transfer smaller than today's single 113 KB file plus inline JS for first load, with images lazy-loaded and served as sized WebP/AVIF.
- Nav, footer, and booking CTAs defined once and reused (0 duplicated copies across pages).

---

## 2. Technical Context

### Stack
SvelteKit (`@sveltejs/adapter-static`) · Netlify (marketing) · PWA via SvelteKit service worker. Future siblings (not in this spec): app on Hostinger VPS via Coolify, Clerk, self-hosted Supabase, R2.

### Where This Feature Touches the Architecture
- **Deployment target**: Netlify marketing site only. Nothing here runs on the VPS.
- **Components involved**: Netlify (matches `ARCHITECTURE.md` "Marketing / landing pages ... static SvelteKit routes"). External links to Dick's scheduling, Google Maps, and the app subdomain.
- **Data flow**: Marketing -> "Sign In / Get Started" -> `app.treythornockgolf.com` (Clerk sign-in happens there). No data flows from the marketing site to the app.
- **Where new code lives**: see Repository Layout below.

### Repository Layout (assumption, see section 10)
The app and ffmpeg worker will be separate deployments, so use a workspace layout:
```
apps/marketing/        SvelteKit static site (this spec)
  src/routes/          +layout.svelte, +page.svelte, golf-lessons-durham/+page.svelte
  src/lib/components/  Nav, Footer, Section, PricingTabs, BookingForm, Faq, ...
  src/lib/content/     typed content modules (pricing, programs, testimonials, FAQ)
  static/              images, manifest, icons, robots.txt, _redirects
legacy/                original HTML files, kept until cutover is verified, then removed
```
`index-trey-website.html` (practice-plan generator) and `user-profile.html` are **not** moved here; see Out of Scope.

---

## 3. Feature Categories

### 3.1 SvelteKit Migration (roadmap item 1)

#### Feature: Static SvelteKit project with shared layout
**Priority**: Must-Have
**Roles**: Visitor

**Description**:
Create `apps/marketing` with `adapter-static`, prerendering every route. One `+layout.svelte` owns the sticky nav (with scroll shadow, dropdowns, hamburger/mobile menu) and footer, replacing the per-page copies and the inline `<script>` blocks.

**User Story**:
As Trey, I want the nav and footer defined once so a change appears on every page.

**Acceptance Criteria**:
```gherkin
Scenario: Build output is fully static
  Given the project is built with the static adapter
  When the build completes
  Then every route exists as prerendered HTML in the output directory
  And no server runtime is required to serve the site

Scenario: Shared layout
  Given the home and Durham pages
  When the nav links or footer text are changed in the layout component
  Then both pages show the change after one rebuild

Scenario: Mobile menu
  Given a viewport narrower than the current mobile breakpoint
  When the user taps the hamburger
  Then the menu opens, body scroll locks, aria-expanded is "true"
  And tapping any menu link or the close control closes it and restores scroll
```

**Technical Notes**:
- Prerender everything: `export const prerender = true` in the root layout. Fail the build on any broken internal link.
- Replace the inline scripts: scroll-shadow nav, reveal-on-scroll (IntersectionObserver), pricing tabs, hamburger, footer year. Use Svelte components/actions; reveal-on-scroll becomes a reusable action that must respect `prefers-reduced-motion`.
- Keep the CSS design tokens (`--navy`, `--gray-warm`, ...) as global CSS custom properties; scope component styles.

#### Feature: Faithful port of home and Durham pages
**Priority**: Must-Have
**Roles**: Visitor

**Description**:
Port all 22 home sections (`home`, `assessment`, `coaching-built-around-you`, `who-i-coach`, `lessons`, `development`, `results`, `why-trey`, `practice-purpose`, `technology`, `club-fitting`, `junior`, `lesson-experience`, `about`, `testimonials`, `pricing`, `other-coaching`, `faq`, `book`, `locations`, `contact`, `newsletter`) and the full Durham page with identical copy, anchors, and behavior. Structured content (pricing tiers, programs, testimonials, FAQ) moves to typed modules in `src/lib/content/` so copy edits do not touch markup.

**User Story**:
As a visitor, I want the site to look and behave as it does today so nothing I rely on breaks.

**Acceptance Criteria**:
```gherkin
Scenario: Anchors preserved
  Given an existing deep link such as /#pricing or /#book
  When it is opened on the new site
  Then the page scrolls to the matching section

Scenario: Booking form fallback unchanged
  Given the booking form is filled with name, email, phone, lesson type, preferred date/time, and a message
  When the visitor submits
  Then the browser opens a mailto: to thornockgolf@gmail.com with the subject "Lesson Request: <type>" and all fields in the body
  And no success message implies a server received the request

Scenario: Pricing tabs
  Given the pricing section
  When a tab is selected
  Then only its panel is visible and the tab has the active state, operable by keyboard

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
- Copy the text verbatim; do not rewrite marketing copy as part of the port.
- Move phone/email/address/scheduling URL into one `siteConfig` module (also feeds JSON-LD and footer).
- Fonts: replace Google Fonts `<link>` with self-hosted Poppins and Inter subsets (needed for offline in the PWA phase; also removes a third-party request). Use `font-display: swap`.
- Images (`img-01..13`, 2.1 MB total, `img-03.jpg` 413 KB): generate responsive WebP/AVIF with explicit `width`/`height`, `loading="lazy"` below the fold, hero image eager. Use a build-time image plugin (see Stack Extensions).

#### Feature: SEO and URL continuity
**Priority**: Must-Have
**Roles**: Visitor, search engines

**Description**:
Keep search rankings and links working. Current canonical URLs are `https://treythornockgolf.com/` and `https://treythornockgolf.com/golf-lessons-durham.html`.

**Acceptance Criteria**:
```gherkin
Scenario: Old Durham URL
  Given a request to /golf-lessons-durham.html
  When Netlify serves it
  Then it returns a 301 to /golf-lessons-durham (or serves the same content), and the canonical tag points to the final URL

Scenario: Metadata parity
  Given each page
  When the built HTML is inspected
  Then it has the same <title>, meta description, canonical, and the LocalBusiness JSON-LD (name, address 6910 Fayetteville Road Durham NC 27713, telephone, email, areaServed) as today. Open Graph/social tags do not exist today; adding them (Should-Have) is a small addition during the port

Scenario: Crawlability
  Given the deployed site
  When /sitemap.xml and /robots.txt are requested
  Then both exist and list the live pages
```

**Technical Notes**:
- Netlify `_redirects` (or `netlify.toml`) for the `.html` -> clean URL 301s. Decide trailing-slash behavior once (`trailingSlash: 'never'`) and keep canonicals consistent.
- JSON-LD emitted from the layout/page `<svelte:head>` using `siteConfig`.
- Update `README.md` after cutover (files, deploy settings, verify steps).

#### Feature: Netlify deployment
**Priority**: Must-Have

**Acceptance Criteria**:
```gherkin
Scenario: Production deploy
  Given the Netlify site for treythornockgolf.com is switched to build apps/marketing
  When a commit lands on main
  Then Netlify runs the build and publishes the static output with no manual step

Scenario: Deploy preview
  Given a pull request
  When it is opened
  Then Netlify creates a deploy preview used to verify before merge

Scenario: Rollback
  Given a bad deploy
  When the previous Netlify deploy is restored
  Then the site returns to the prior version within minutes (legacy HTML remains in git history)
```

**Technical Notes**:
- Netlify settings change from "no build, publish `.`" (current README) to a build command and publish directory for `apps/marketing`; set base directory if using the workspace layout. Add a `netlify.toml` to make this reproducible in the repo.
- Security headers via `netlify.toml` (`X-Content-Type-Options`, `Referrer-Policy`, a `Content-Security-Policy` compatible with self-hosted fonts and the inline JSON-LD).

### 3.2 PWA Compatibility (roadmap item 2)

#### Feature: Web app manifest and icons
**Priority**: Must-Have

**Description**:
Add `manifest.webmanifest` (name "Trey Thornock Golf", short_name, `display: standalone`, `start_url: /`, `theme_color` and `background_color` from the brand tokens) and icon set. Only `img-01.png` (logo, 40 KB) exists today, so 192x192, 512x512, and a maskable 512x512 icon must be produced from it, plus an Apple touch icon.

**Acceptance Criteria**:
```gherkin
Scenario: Installable
  Given the deployed site over HTTPS
  When Lighthouse (or Chrome DevTools > Application) checks installability
  Then the manifest is valid, icons 192 and 512 resolve, and a service worker controls the page

Scenario: iOS home screen
  Given Safari on iOS
  When the visitor chooses Add to Home Screen
  Then the apple-touch-icon and title are used and the site opens without browser chrome
```

#### Feature: Service worker and offline fallback
**Priority**: Must-Have

**Description**:
Use SvelteKit's native `src/service-worker.ts` (build/files/prerendered lists from `$service-worker`) with versioned caches. Marketing content must never go stale: HTML is network-first with cache fallback; hashed build assets and fonts/images are cache-first. An `/offline` page is served when a navigation fails and nothing is cached.

**Acceptance Criteria**:
```gherkin
Scenario: Offline revisit
  Given the visitor has loaded the home page once
  When they reopen it with no network
  Then the cached home page renders

Scenario: Offline first-time route
  Given a route that was never visited and no network
  When it is requested
  Then /offline is shown with the phone number and email as plain links

Scenario: Update delivery
  Given a new deploy changes assets
  When the visitor next has a connection
  Then the old cache is deleted on activate and fresh HTML is fetched (no stale pricing)

Scenario: No cross-origin caching
  Given requests to Dick's scheduling, Google Maps, or the app subdomain
  When they are made
  Then the service worker does not intercept or cache them
```

**Technical Notes**:
- Do not precache the app subdomain or any `app.` links; the app PWA is a separate project with its own scope.
- Registration only in production builds. Provide a visible way to recover from a bad worker (documented unregister/cache-bust step in `README.md`).

### 3.3 Landing Page Reorganization (roadmap item 3, lower priority)

#### Feature: Reorganize information architecture and flow
**Priority**: Should-Have (explicitly lower priority per roadmap; do after items 1 and 2 ship)

**Description**:
The home page has 22 sections on one scroll, with overlapping topics (`coaching-built-around-you`, `why-trey`, `practice-purpose`, `technology`, `lesson-experience`). Proposed flow, with the long-form detail moved to its own pages and the home page reduced to a decision funnel:

| Route | Purpose | Draws from current sections |
|---|---|---|
| `/` | Hero, assessment CTA, programs summary, results/testimonials, about teaser, one booking CTA | home, assessment, lessons (summary), results, testimonials, about (short) |
| `/golf-lessons-durham` | Local SEO page (exists) | unchanged content |
| `/programs` | Programs, development system, who I coach, lesson experience, technology | lessons, development, who-i-coach, lesson-experience, technology, why-trey, practice-purpose |
| `/junior` | Junior golf | junior |
| `/club-fitting` | Club fitting | club-fitting |
| `/pricing` | Pricing tabs, online and private coaching | pricing, other-coaching |
| `/about` | About Trey, results | about, results |
| `/contact` | Booking form, locations, FAQ, newsletter | book, locations, faq, newsletter |

**User Story**:
As a visitor, I want one clear next step (take the assessment / book a lesson) instead of scrolling 22 sections.

**Acceptance Criteria**:
```gherkin
Scenario: Single primary CTA
  Given any page
  When viewed on mobile
  Then exactly one primary booking/assessment CTA is visible per screen of content, and the nav has Book and Sign In in consistent positions

Scenario: Old anchors still work
  Given an old link such as /#pricing
  When opened
  Then the visitor is redirected (client-side or 301 where possible) to /pricing

Scenario: No lost content
  Given the old home page content inventory
  When the new site is reviewed
  Then every section is either present on the new routes or explicitly marked removed in the PR
```

**Technical Notes**:
- This table is a **proposal**; Trey should approve the IA and any copy trimming before work starts (see Assumptions). Sections move as components, so Phase 1 work is reused unchanged.
- Hash anchors cannot be redirected server-side; add a small client-side map for legacy `#section` links.

### 3.4 App Entry Links (roadmap item 4, link only)

#### Feature: Sign In / Get Started links
**Priority**: Must-Have (link only)
**Roles**: Visitor, Player, Coach

**Description**:
Add "Sign In" and "Get Started" to the desktop nav, mobile menu, and footer. Both are plain links to the app subdomain (`/sign-in` and `/sign-up` paths on `app.treythornockgolf.com`). The marketing site does not load Clerk, does not read sessions, and does not set cookies for auth.

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

Scenario: Offline
  Given the visitor is offline
  When they click an app link
  Then the browser's normal failure occurs; the service worker does not cache it
```

**Technical Notes**:
- Env-driven via SvelteKit `$env/static/public` so the links can ship dark until the app deploys; set values in Netlify env vars (not secrets, but keep out of git anyway).
- Exact app paths (`/sign-in`, `/sign-up`) are defined by the app spec later; keep them in `siteConfig`.

---

## 4. Data Model

Not applicable. Content is static, typed modules checked into git. No Postgres tables, queues, or Realtime channels.

---

## 5. API / Interface Design

No server routes. The site is fully prerendered.

| Interface | Notes |
|---|---|
| Booking form | Client-side `mailto:` to `thornockgolf@gmail.com`, unchanged behavior |
| Newsletter form | Currently a mailto link ("Wyoming Golf Updates"); keep as mailto unless a provider is chosen (out of scope) |
| Outbound links | Dick's scheduling, Google Maps, Google Form (assessment), `tel:`, `mailto:`, app subdomain |
| Build-time env | `PUBLIC_APP_URL`, `PUBLIC_SHOW_APP_LINKS` |

Any future form backend (Netlify Forms or otherwise) is a stack extension, not part of this spec.

---

## 6. UI/UX Requirements

### Routes / Screens
| Route | Description | Role |
|---|---|---|
| `/` | Home | Visitor |
| `/golf-lessons-durham` | Durham local SEO page | Visitor |
| `/offline` | Offline fallback | Visitor |
| `/sitemap.xml`, `/robots.txt` | Crawler files (prerendered endpoints) | Crawlers |
| Item 3 routes: `/programs`, `/junior`, `/club-fitting`, `/pricing`, `/about`, `/contact` | Phase 3 only | Visitor |

### Components
- **SiteNav** (`src/lib/components/SiteNav.svelte`) - brand, dropdown groups, scroll shadow, hamburger/mobile menu, Book CTA, Sign In / Get Started (flag-gated).
- **SiteFooter** - contact, hours/location, links, dynamic year.
- **Section** - wrapper with id, background variant, reveal-on-scroll action.
- **PricingTabs** - accessible tablist (`role="tablist"`, arrow keys).
- **BookingForm** - fields as above, builds the mailto.
- **Faq** - disclosure items (native `<details>` or accessible accordion), matching current behavior.
- **ResponsiveImage** - wraps generated sources with width/height/lazy.
- **JsonLd** - renders the LocalBusiness schema from `siteConfig`.

### State Management
Component-local runes/state only (menu open, active tab). No global stores.

### PWA Considerations
Installable, offline shell for visited pages, `/offline` fallback, network-first HTML so pricing and copy never go stale. Respect `prefers-reduced-motion` for reveal animations. No upload or auth behavior on this site.

---

## 7. Non-Functional Requirements

### Performance
- Lighthouse mobile Performance >= 90; LCP < 2.5 s on 4G; CLS < 0.1; hero image preloaded.
- No render-blocking third-party requests (self-hosted fonts).

### Security
- No secrets on the marketing site. Only `PUBLIC_*` env vars. Repo is public.
- Security headers and CSP in `netlify.toml`; all `target="_blank"` links use `rel="noopener"`.
- Service worker scope limited to the marketing origin.

### Accessibility
- WCAG 2.1 AA: keyboard-operable nav dropdowns, pricing tabs, FAQ, and mobile menu; visible focus; `aria-expanded` kept in sync; color contrast verified for the navy/lime palette; skip-to-content link.

### Reliability / Observability
- CI build fails on broken internal links and missing images.
- Netlify deploy previews for every PR; one-click rollback.

### Capacity
- Static hosting on Netlify's existing plan; nothing on the Hostinger VPS or R2.

---

## 8. Implementation Phases

### Phase 1: Migration and cutover (item 1)
**Goal**: SvelteKit site live on Netlify, visually and functionally identical.
- [ ] Scaffold `apps/marketing` (SvelteKit + static adapter, TypeScript), move originals to `legacy/`
- [ ] `siteConfig` and typed content modules; global CSS tokens
- [ ] SiteNav, SiteFooter, Section, PricingTabs, BookingForm, Faq, ResponsiveImage, JsonLd
- [ ] Port home page (all 22 sections) and Durham page
- [ ] Self-host fonts; optimize images
- [ ] `sitemap.xml`, `robots.txt`, `_redirects` (`.html` -> clean URLs), `netlify.toml` with headers
- [ ] Sign In / Get Started links behind `PUBLIC_SHOW_APP_LINKS` (item 4 link)
- [ ] Netlify deploy preview review, side-by-side check against `legacy/`, then switch production
- [ ] Update `README.md`; delete `legacy/` after a stable week

### Phase 2: PWA (item 2)
**Goal**: Installable with a safe offline strategy.
- [ ] Manifest and icon set (192, 512, maskable, apple-touch) generated from `img-01.png`
- [ ] `src/service-worker.ts` with versioned caches, network-first HTML, cache-first assets
- [ ] `/offline` page
- [ ] Real-device install test on iOS and Android; Lighthouse PWA checks

### Phase 3: Landing page reorganization (item 3, lower priority)
**Goal**: A clear funnel instead of a 22-section scroll.
- [ ] Trey approves IA and copy changes
- [ ] New routes per section 3.3; legacy anchor redirect map
- [ ] Update sitemap, canonicals, nav, and 301s; re-run Lighthouse and link checks

---

## 9. Out of Scope (v1)

- Clerk, sessions, or any auth UI on the marketing site - Reason: auth lives on `app.` (roadmap item 4, app side).
- `index-trey-website.html` (practice-plan generator, `treythornockgolfpractice.netlify.app`) - Reason: roadmap items 14-16 move it into the app; it stays a separate Netlify site until then.
- `user-profile.html` (player profile) - Reason: roadmap item 11, app work.
- Form backend, newsletter provider, analytics - Reason: not in the roadmap; mailto behavior is retained.
- Copywriting changes beyond the Phase 3 IA - Reason: content decisions belong to Trey.
- Pose estimation / ML swing analysis (OpenCV + MediaPipe) - Reason: deferred post-MVP, separate Python worker.

---

## 10. Assumptions & Dependencies

### Assumptions
- Workspace layout (`apps/marketing`, later `apps/app` and `apps/worker`) is acceptable; the alternative is a SvelteKit project at the repo root, which would complicate adding the app and worker later. Confirm before scaffolding.
- Old Durham URL moves to a clean URL with a 301. If Trey prefers keeping `.html` URLs, set it up as a rewrite instead; either is fine as long as canonicals match.
- App sign-in and sign-up paths will be `/sign-in` and `/sign-up` on `app.treythornockgolf.com`.
- The Phase 3 information architecture is a proposal pending Trey's approval.
- `roadmap.md` and `ARCHITECTURE.md` agree on the marketing/app split; no conflict found.

### Dependencies
- Requires: none for Phases 1-2 (no VPS, Clerk, or Supabase needed).
- External setup: Netlify site settings changed to build `apps/marketing`; DNS stays as is; `app.` A record and live app are only needed to enable the Sign In / Get Started links.

### Stack Extensions Required
- **Packages/libraries**: `@sveltejs/adapter-static`; an image optimization plugin (e.g. `@sveltejs/enhanced-img` or `vite-imagetools`) for responsive WebP/AVIF; `@fontsource` packages (or manually self-hosted woff2) for Poppins and Inter; Playwright and a link checker for CI smoke tests; Lighthouse CI optional.
- **New vendor integrations**: none.
- **Infrastructure**: none beyond existing Netlify.

---

## 11. Migration & Deployment Notes

- Keep original HTML in `legacy/` through cutover; verify the new build against it section by section before switching Netlify.
- Netlify: change build command and publish directory; add `netlify.toml` (headers, redirects); set `PUBLIC_APP_URL` and `PUBLIC_SHOW_APP_LINKS`.
- No Postgres, Coolify, or secrets involved.
- Rollback: restore the previous Netlify deploy; legacy HTML also remains in git history.
- After deploy: submit the updated sitemap in Search Console and watch for crawl errors for two weeks.

---

## Appendix

### Glossary
- **Marketing site**: public pages at `treythornockgolf.com`, static on Netlify.
- **App**: the coaching product at `app.treythornockgolf.com` (separate deployment, not in this spec).
- **PWA**: web app with manifest and service worker, installable on a phone's home screen.

### Related Documentation
- `roadmap.md`
- `ARCHITECTURE.md`
- `README.md`
