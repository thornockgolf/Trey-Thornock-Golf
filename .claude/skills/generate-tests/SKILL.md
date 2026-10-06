---
name: generate-tests
description: Generates tests for the Trey Thornock Golf SvelteKit app and ffmpeg/pg-boss worker (Vitest, Testing Library, Playwright), focused on role permissions, presigned uploads, Stripe webhooks, annotations, and the video job pipeline. Use when new app or worker code needs test coverage. Targets about 80% on critical paths.
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
user-invocable: true
---

# Test Generation — Trey Thornock Golf

Generate focused tests that match the repo's existing patterns. The marketing pages are currently static HTML with no test setup; the app and worker are SvelteKit/Node and are where tests matter.

```
/generate-tests @src/routes/api/uploads
/generate-tests Stripe webhook handler
```

With no target, find changed source files (`git status`, `git diff --name-only`) lacking tests and propose them.

## Step 1: Detect the Setup

1. Read `package.json` scripts and config for the runner. Expected for SvelteKit: **Vitest** (unit/server), **@testing-library/svelte** (components), **Playwright** (E2E). Use whatever is actually configured; read 2-3 neighboring tests and match naming (`*.test.ts` / `*.spec.ts`), location, fixtures, and mocking style.
2. If the SvelteKit project has no tests yet, add the minimal Vitest config (and Playwright only if E2E is requested) and say so in the summary.
3. Pre-SvelteKit: `node .\work\verify-current.js` (mentioned in `README.md`) is the existing check for the practice-plan HTML tool. Do not break or replace it.

## Step 2: Critical Paths for This App (prioritize)

| Area | What to test |
|---|---|
| **Auth + roles** | Unauthenticated request -> 401; Player hitting Coach-only route -> 403; Coach can only see assigned players' videos/plans; Clerk user ID scoping so a player cannot read another player's rows |
| **Presigned upload** | URL issued only to authenticated users; key is namespaced to the user; content type / size limits enforced; expiry set; no bytes pass through the app |
| **Video pipeline** | `video.uploaded` job enqueued after upload completes; worker updates status (`uploaded` -> `processing` -> `ready` / `failed`); failed transcode retries then marks `failed`; source file is never deleted; thumbnail key stored |
| **Annotations** | Stored as JSON with timestamp and shape; CRUD scoped to video access; **coach re-record of a time range leaves annotations outside that range untouched** (roadmap item 8) and is Coach-only |
| **Stripe** | Webhook signature verified (bad signature -> 400); event handling is idempotent (same event twice = one state change); plan/status derived from webhooks, never from client input; gated coaching routes deny unpaid users |
| **Chat** | Message write goes through the server to Postgres; only conversation participants can read/write; Coach/Player pairing enforced |
| **Intake -> plan** | Structured answers map to a plan via the coaching rules; zero-problem and multi-problem cases; session length totals (30/45/60/90) |
| **Compare/overlay (components)** | Both players render; scrub slider updates both; auto-replay at end; controls keyboard-accessible |

**Do not test**: video.js / Fabric.js / Uppy internals, Clerk/Stripe/Supabase SDK internals, static marketing copy, simple getters.

## Step 3: Write the Tests

- One behavior per test, Arrange/Act/Assert, descriptive names stating scenario and expectation.
- **Mock only at system boundaries**: Clerk session, R2/S3 client, Stripe SDK, Supabase Realtime channel, and the ffmpeg binary. Use a real Postgres (local container or test schema) for data-layer and pg-boss tests when the project has one; otherwise a faithful in-memory fake and a note about the gap.
- Parametrize permission matrices (role x route) rather than copying tests.
- Deterministic: fake timers for presigned expiry and job retries; no sleeps.
- Never use real keys or network. Use fixture IDs and Stripe test-mode signed payloads built with the SDK's test helper.
- Component/E2E selectors: role -> label -> text -> test id. For video, assert on player state/events, not pixels.
- Always include: not-found, forbidden, duplicate/idempotent, external-service-failure cases.

## Step 4: Validate

Run the new file with the project's runner, then the surrounding suite, then coverage if configured. If a test fails because of a real bug, **do not weaken the test**: report the bug. Fix flakiness at the cause.

## Output

```markdown
## Test Generation Summary
**Target**: {module}   **Tests**: {count}
### Files
- `path/to/file.test.ts` ({count})
### Covered
- Critical paths: ...   Edge cases: ...
### Result
All passing | {n} failing: details
### Run
{exact commands from package.json}
```
