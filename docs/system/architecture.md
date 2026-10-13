# Architecture (as built)

## Workspaces

Bun workspaces monorepo, one `bun.lock`. TypeScript strict (`tsconfig.base.json`).

| Workspace | What it is | Status |
|---|---|---|
| `apps/marketing` | SvelteKit 3, `adapter-static`, deployed to Netlify. Two route groups: `(home)` (full nav) and `(guide)` (Durham page, compact chrome). PWA with a page-caching service worker. | Built |
| `apps/app` | SvelteKit 3, `adapter-node` run with Bun, at `app.treythornockgolf.com`. Clerk sign-in, role guard, app shell, shell-only PWA. | Foundation plus the video pipeline and player, annotations, reference library, compare, analysis recorder, and the coaching product (plans, coach dashboard and player page, check-ins, tests, calendar, profile) |
| `apps/worker` | Bun process: pg-boss consumer (`video.uploaded` transcode, poster, sprite), internal `/healthz`, ffmpeg in its image. | Video handler built |
| `packages/ui` (`@ttg/ui`) | Skeleton v5 `ttg` theme, tokens, base styles, Fontsource fonts, and `VideoPlayer` (video.js with custom controls: frame step, 0.1x-2x, auto-replay, sprite scrub preview, signed-URL refresh, optional overlay slot and scrub-bar markers), the annotation layer (`AnnotationCanvas`, `AnnotationToolbar`, drawing logic; Fabric.js renders the shapes), `CompareView` / `OverlayView` with the `SyncController`, and `CommentaryAudio` (the coach's recordings playing with the video). | Built |
| `packages/shared` (`@ttg/shared`) | `siteConfig`, API/error schemas, storage keys and limits, job definitions. | Built |
| `packages/db` (`@ttg/db`) | SQL migrations and runner, `Db`, `Users`, `Videos`, `Annotations`, `Analyses`, `Segments`, `Queue`, `Questionnaires`, `Drills`, `Plans`, `Coaching`, `CheckIns`, `Assessments`, `Profiles`, `Notifications`, `Chat`, `Billing` Effect services and the `Realtime` publisher. | Built |
| `legacy/` | Original static HTML, kept until marketing cutover is verified. | To remove after cutover |

## Versions (resolved in `bun.lock`, 2026-10-12)

Bun 1.4.2 · TypeScript 6.0.3 (Kit 3 requires 6.x; 7.x breaks it) · SvelteKit 3.0.1 · Svelte 5.57.2 · Vite 8.3.4 · Tailwind 4.3.3 · Skeleton 5.0.1 (`@skeletonlabs/skeleton`, `skeleton-svelte`) · Effect 4.0.3 · video.js 8.24 and Fabric.js 7.4 (`@ttg/ui`) · Uppy core 6.2 (custom uploader plugin; `@uppy/aws-s3` 6.x no longer fits our server-signed flow) · `svelte-clerk` 1.2.0 (unofficial) · pg 8.23.1 · pg-boss 12.37.1 · AWS SDK v3 3.1149 (`client-s3`, `s3-request-presigner`) · Vitest 5.0.4 · adapter-node 6.0.0 · adapter-static 4.0.0.

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

Vitest in `apps/app` (Effect error mapping, auth, guards, R2 presigning offline, nav, service-worker routing and update logic), `packages/db` (migrations, constraints, `Db`, `Users`, `Videos`, `Queue` against a real Postgres and real pg-boss), `packages/shared` (keys, limits, schemas, jobs, annotation shapes), `packages/ui` (annotation drawing logic, sync controller) and `apps/worker` (generated ffmpeg clips through the real pipeline with an in-memory `Storage` and a real database). The app also tests the video handlers with real Users/Videos on a throwaway database, an in-memory R2 and queue (the 403 matrix), and the upload logic and controller against a fake server. Database tests need `docker compose up -d db`. No end-to-end browser tests with a real Clerk session yet.

## Annotation layer

`AnnotatedPlayer` (`apps/app/src/lib/videos`) puts `AnnotationCanvas` in the player's overlay slot. The canvas is sized by a `ResizeObserver` to the picture's rectangle (the video's aspect, letterboxed inside the player), so normalized coordinates line up with the picture. Fabric `StaticCanvas` only renders; pointer input is handled by `DrawSession` (pure, unit-tested), and every shape is drawn with a halo. Coaches draw while paused, undo/redo/clear work on unsaved drafts, and Save posts each draft with the paused time as `start_ms`. Players get the same layer with pointer events off, so taps still play and pause. The list under the player is the text alternative. `/dev/annotations` previews all of it against an in-memory mock API (`?role=player`, `?vertical=1`).

## Coaching product

Part F lives in `apps/app/src/lib/coach` (plan composer, dashboard, player page, coach tools), `lib/calendar` (`PlanCalendar`, check-in form), `lib/questionnaire`, `lib/plans` (the player's plan view) and `lib/profile`. Each screen has a pure logic module with unit tests (`composer.ts` for session totals, `calendar-view.ts` for the date maths, `profile-form.ts` for validation). The shared packages hold the typed content and rules: `questionnaire.ts` (the form and validation), `plans.ts` (plan structure and the 30/45/60/90 totals), `calendar.ts` (check-ins, tests, trends and `buildCalendarItems`), `players.ts`, `profile.ts`.

## Communication and payments (Part E)

Server handlers: `chat.ts` (conversations, messages, read pointers, the page data), `notifications.ts`, `realtime.ts` (channel tokens), `billing.ts` (billing state, Checkout, Portal, the Stripe webhook), `entitlements.ts` (the payment gates), `stripe.ts` (`StripeApi`, signature check) and `notify.ts`. Browser code is in `lib/chat`, `lib/realtime` (client, `unread` store, chat state), `lib/notifications`, `lib/billing`; `AppShell` starts the `unread` store and shows the bell, the Messages badge and the failed-payment banner.

Payment rules (`entitlementsFor` in `packages/shared/src/billing.ts`, read from webhook-written rows only): the paid assessment, or any membership, unlocks the questionnaire and swing uploads (402 `PaymentError` with `billingUrl` otherwise; coaches are never gated). An active or trialing membership, past_due inside 7 days of the first failure, or a cancelled one until its paid period ends, unlocks chat sending and check-in submission. Reading is never blocked. A paid assessment pairs the player with the longest-standing coach (`coach_assignments` plus a conversation) if they have none, and notifies both.
