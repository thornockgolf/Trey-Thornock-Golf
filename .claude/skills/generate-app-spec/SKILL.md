---
name: generate-app-spec
description: Generates application specifications for the Trey Thornock Golf coaching app (SvelteKit, Clerk, self-hosted Supabase Postgres + Realtime, Cloudflare R2, pg-boss + ffmpeg worker, Stripe, on Hostinger KVM 4 via Coolify). Use when starting a feature or the MVP and you need a structured spec that fits the decided stack and infrastructure.
allowed-tools: Read, Write, Edit, Grep, Glob, AskUserQuestion
user-invocable: true
---

# Generate Application Specification — Trey Thornock Golf

You are an expert product manager and software architect writing specs for the Trey Thornock Golf platform: a marketing site plus a golf video analysis and coaching app. This skill follows the **Specification-Driven Development (SDD)** pattern.

The tech stack and infrastructure are **already decided**. Do not re-litigate them, do not ask the user about them, and do not propose alternatives (no Multer, MongoDB, Socket.IO, Firebase, etc.). Specs build on the stack below.

---

## Input Handling

```
/generate-app-spec Add the side-by-side compare feature
/generate-app-spec @roadmap.md
/generate-app-spec MVP
```

If no input is given, ask for a one-paragraph description of what to spec. With `MVP` or `@roadmap.md`, spec the full app from the roadmap items.

---

## Phase 1: Read Project Context

Read these first, in order. They are the source of truth:

1. `roadmap.md` — numbered feature list, per-item **Decision** notes, infrastructure and stack decisions, post-MVP items.
2. `ARCHITECTURE.md` — system diagram, component responsibilities, and key data flows (upload → processing → playback, auth, chat, payments).
3. `README.md` and the existing `index.html`, `index-trey-website.html`, `golf-lessons-durham.html` — current static landing pages, copy, practice plan content, and the intake questionnaire that features build on or migrate.
4. Whatever SvelteKit code exists (`package.json`, `svelte.config.js`, `src/`) — if the SvelteKit migration has started, match its layout and conventions. If not, the spec assumes a fresh SvelteKit project.

If `roadmap.md` and `ARCHITECTURE.md` disagree, `roadmap.md` wins; flag the conflict in the spec's Assumptions.

### Fixed Stack (the foundation)

| Layer | Decision |
|---|---|
| App framework | **SvelteKit** (Svelte), **PWA-compatible** (manifest, service worker, installable, offline shell) |
| Marketing site | `treythornockgolf.com`, static SvelteKit routes on **Netlify**. "Sign In / Get Started" links to the app subdomain |
| App | `app.treythornockgolf.com`, separate SvelteKit deployment (Node server) on the VPS |
| Auth | **Clerk** (hosted). Session/JWT verified by the SvelteKit server on each request. Postgres rows are scoped by **Clerk user ID**; no auth logic lives in Postgres |
| Database | **Postgres via self-hosted Supabase** (Docker). Relational model: users → coaches → videos → annotations → plans → payments |
| Realtime | **Supabase Realtime** (self-hosted). Chat and live status updates (e.g. "processing complete") |
| File storage | **Cloudflare R2** (S3-compatible). Raw and processed videos plus thumbnails. Videos never go in the database |
| Upload | **Presigned R2 URLs + Uppy.js**. Browser uploads directly to R2, never through the app server |
| Video processing | **ffmpeg** in a background worker on the VPS, server-side only: transcode and thumbnail |
| Job queue | **pg-boss** (lives in Postgres, no Redis) |
| Video playback | **video.js**: scrubbing, auto-replay on end, side-by-side compare with sliders |
| Annotations | **Fabric.js** canvas overlay on the video. Stored as **JSON (shape + timestamp) in Postgres**, never burned into video pixels |
| Payments | **Stripe** (Checkout + Customer Portal, webhooks). Account not yet created, so include setup as a dependency |
| Hosting / deploy | **Hostinger KVM 4 VPS** (4 vCPU / 16 GB / 200 GB NVMe) orchestrated by **Coolify** (Docker deploys) |

### Architectural Rules (every spec must respect these)

1. **Annotations are separate from video.** JSON with timestamps in Postgres. This is what makes coach re-recording (roadmap item 8) possible: re-recording replaces only that time range's video data; annotations outside the range stay valid.
2. **Keep source videos.** Store the original upload in R2 in addition to processed versions. Post-MVP pose estimation needs source footage.
3. **Uploads bypass the app server.** App issues presigned URL → browser uploads to R2 → app enqueues a `video.uploaded` pg-boss job → worker transcodes, writes to R2, and updates Postgres status.
4. **Long-running work goes through pg-boss.** Nothing heavy runs in a request handler, and nothing long-running is designed for Netlify's serverless model.
5. **Chat writes go through the app server to Postgres.** Realtime pushes them to subscribers on a conversation channel.
6. **Payment state comes from Stripe webhooks.** The app server updates plan/status in Postgres; never trust the client.
7. **Two roles with different permissions:** Player and Coach. Coach-only features (re-record, practice plan authoring, viewing assigned players' videos) must state their permission check explicitly.
8. **Two services:** (a) **Intake → generated practice plan** (self-serve; the user fills a structured questionnaire about their swing and goals, and a plan is generated from the answers) and (b) **One-on-one coaching** (coach reviews video analysis, gives feedback, assigns practice plans, chats). Specify which service a feature belongs to.

### Post-MVP (do not spec as in scope)

Pose estimation / ML swing analysis (OpenCV + MediaPipe) as a separate Python worker consuming a new pg-boss job type. Mention it only under Out of Scope and, where relevant, as a reason to keep source video.

### Known Domain Context

- Roadmap items 1–3 (SvelteKit migration, PWA, landing page reorganization) are marketing-site work; items 4+ are the app.
- Questionnaire (item 14) should be **structured questions** about swing issues and improvement goals, not open-ended text.
- Practice plans (item 15) already exist as content in the HTML pages; the spec should migrate and improve them, including a calendar view for plans, check-ins, and tests/assessments.
- Compare (item 5) is a pro golfer video next to the user's video, with synchronized playback and a scrub slider for each. Overlay (item 9) places another video (pro or the user's previous swing) on top of the user's video.
- Videos can be downloaded by both user and coach (item 13).
- Player profile page (item 11) is to be integrated from existing material.

Do not ask the user about any of the above. Ask (with AskUserQuestion, max one short question) only for genuinely missing product decisions, such as pricing tiers, which cannot be derived from the repo.

---

## Phase 2: Generate Specification

### Output File

Write the specification to `app_spec.md` in the repo root (or the path the user specifies).

### Specification Template

Adapt detail to the feature. Drop sections that do not apply (for example, Data Model for a marketing-page-only feature).

```markdown
# [Feature/Project Name] - Application Specification

> Generated: YYYY-MM-DD
> Status: Draft
> Extends: Trey Thornock Golf platform (see roadmap.md, ARCHITECTURE.md)
> Roadmap items: [numbers from roadmap.md]
> Service: Intake/Practice Plan | One-on-One Coaching | Both | Marketing site

---

## 1. Executive Summary

### Problem Statement
[1-2 paragraphs]

### Solution Overview
[1-2 paragraphs]

### Target Users
- **Player**: [goals and pain points]
- **Coach (Trey)**: [goals and pain points]
- **Visitor (marketing site)**: [if applicable]

### Success Metrics
- [Specific, measurable outcome]

---

## 2. Technical Context

### Stack
SvelteKit (PWA) · Clerk · self-hosted Supabase (Postgres + Realtime) · Cloudflare R2 · Uppy.js · video.js · Fabric.js · pg-boss + ffmpeg worker · Stripe · Netlify (marketing) · Hostinger VPS + Coolify (app)

### Where This Feature Touches the Architecture
- **Deployment target**: Netlify marketing site | VPS app | VPS worker
- **Components involved**: [from ARCHITECTURE.md, e.g. App server, Postgres, Realtime, R2, pg-boss, ffmpeg worker, Clerk, Stripe]
- **Data flow**: [which flow from ARCHITECTURE.md it extends, or the new flow, numbered steps]
- **Where new code lives**: [SvelteKit route group / worker module / shared lib]

---

## 3. Feature Categories

### 3.1 [Category Name]

#### Feature: [Feature Name]
**Priority**: Must-Have | Should-Have | Could-Have | Won't-Have
**Roles**: Player | Coach | Both

**Description**:
[What and why]

**User Story**:
As a [Player/Coach], I want [action] so that [benefit].

**Acceptance Criteria**:
```gherkin
Scenario: [Happy path]
  Given [precondition]
  When [action]
  Then [expected outcome]

Scenario: [Edge case / permission denial / failure]
  Given [precondition]
  When [action]
  Then [expected outcome]
```

**Technical Notes**:
- [Implementation consideration tied to the fixed stack]

---

## 4. Data Model (Postgres)

All rows are scoped by Clerk user ID. Include `created_at` / `updated_at` on every table.

### New Entities

#### Entity: [Name]
**Storage**: [table name]

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | uuid | PK | Primary identifier |
| clerk_user_id | text | NOT NULL, indexed | Owner (Clerk user ID) |
| [field] | [type] | [constraints] | [description] |

**Relationships**:
- `[relation]` -> [Entity] ([cardinality])

**Indexes**:
- [index] on [field(s)] (for [query pattern])

Video file bytes live in R2. Tables store only keys/URLs and metadata (status, duration, source key, processed key, thumbnail key).

### Object Storage (R2) Layout
[Key naming, raw vs processed vs thumbnail prefixes, retention of source files]

### Job Queue (pg-boss)
| Job name | Producer | Consumer | Payload | Retry/failure behavior |
|----------|----------|----------|---------|------------------------|

### Realtime Channels (Supabase)
| Channel | Publishers | Subscribers | Payload |
|---------|-----------|-------------|---------|

---

## 5. API / Interface Design

SvelteKit server routes (`+server.ts`, form actions, `load` functions). Clerk session required unless noted.

| Method | Endpoint | Description | Auth | Role |
|--------|----------|-------------|------|------|
| POST | /api/[resource] | [Create] | Required | Player/Coach |

Also list: Stripe webhook endpoints (signature-verified, no Clerk session), presigned URL endpoints, and any worker-facing interfaces. Name the files and directories involved.

---

## 6. UI/UX Requirements

### Routes / Screens
| Route | Description | Role |
|-------|-------------|------|

### Components
- **[ComponentName]** - location, purpose, key props, state (name video.js / Fabric.js / Uppy usage where relevant)

### State Management
[Svelte stores / runes / Realtime subscriptions this feature adds]

### PWA Considerations
[Installability, offline behavior, caching rules, upload behavior on flaky mobile networks]

---

## 7. Non-Functional Requirements

### Performance
- [Concrete targets, e.g. scrub latency, time-to-first-frame, processing time per minute of video]

### Security
- Clerk session verification, role checks (Player vs Coach), presigned URL expiry and scope, Stripe webhook signature verification, R2 access, secrets handling

### Accessibility
- [WCAG 2.1 AA, keyboard control of video scrubbing, caption/controls]

### Reliability / Observability
- [Worker retries, failed-transcode handling, Coolify health checks, logging, backups of Postgres]

### Capacity
- [Fits Hostinger KVM 4 (4 vCPU / 16 GB / 200 GB NVMe) and R2 free tier (10 GB storage, 1M writes, 10M reads / month): state the assumptions]

---

## 8. Implementation Phases

### Phase 1: Foundation (MVP)
**Goal**: Core functionality working end-to-end
- [ ] [Migration]
- [ ] [Server logic / API]
- [ ] [UI]
- [ ] [Tests for critical paths]

### Phase 2: Enhanced Features
- [ ] [Item]

### Phase 3: Advanced Features
- [ ] [Item]

---

## 9. Out of Scope (v1)

- Pose estimation / ML swing analysis (OpenCV + MediaPipe) - Reason: deferred post-MVP, separate Python worker
- [Other] - Reason: [why]

---

## 10. Assumptions & Dependencies

### Assumptions
- [Assumption]

### Dependencies
- Requires: [other roadmap item or feature]
- External setup: [e.g. Stripe account not yet created; Clerk application; R2 bucket and CORS; Supabase stack deployed via Coolify; Hostinger VPS provisioned]

### Stack Extensions Required
- **Packages/libraries**: [name - purpose]
- **New vendor integrations**: [name - purpose]
- **Infrastructure**: [name - purpose]

---

## 11. Migration & Deployment Notes

- Postgres migration steps
- New environment variables (Clerk keys, R2 credentials, Stripe keys and webhook secret, Supabase URL and keys)
- Coolify deploy changes (app, worker, Supabase services)
- Rollback plan

---

## Appendix

### Glossary
- **[Term]**: [Definition]

### Related Documentation
- `roadmap.md`
- `ARCHITECTURE.md`
```

---

## Phase 3: Self-Review

After generating, verify:

1. **Stack fidelity**: no technology outside the Fixed Stack appears unless listed under Stack Extensions Required with a reason. No Multer, MongoDB, Socket.IO, Redis, or similar.
2. **Architectural rules**: annotations stored as JSON, source video retained, uploads direct to R2, heavy work via pg-boss, payment state from webhooks.
3. **Roles**: every feature states Player, Coach, or Both, and every API route states its role check.
4. **Hosting split**: marketing work targets Netlify, app and worker work targets the VPS.
5. **Roadmap coverage**: every roadmap item in scope is addressed, and the spec cites the item numbers.
6. **Completeness**: every feature has Given/When/Then criteria including a failure or permission-denied case; the data model supports every feature; the API covers every operation.
7. **No leftovers**: no template placeholders remain.

---

## Output Guidelines

1. **Be Specific**: measurable criteria, no vague language
2. **Be Complete**: acceptance criteria for every feature
3. **Be Prioritized**: MoSCoW (Must/Should/Could/Won't)
4. **Be Testable**: every requirement is verifiable

**Do not include**: re-litigated technology choices, line-by-line implementation, time estimates, team assignments.

---

## Integration with Other Skills

After generating the spec:

1. **`/generate-roadmap`** - convert the spec into a phased, dependency-ordered `work_plan.md`
2. **`/enhance-task-description`** - add technical depth to specific features
