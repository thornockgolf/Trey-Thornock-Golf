---
name: generate-roadmap
description: Converts a Trey Thornock Golf app spec (app_spec.md) into phased, dependency-ordered work items, written to work_plan.md in the repo root. Use after /generate-app-spec to turn a spec into an ordered build plan that respects the repo's infrastructure-first sequence.
allowed-tools: Read, Write, Edit, Grep, Glob, Bash, AskUserQuestion
user-invocable: true
---

# Generate Work Plan — Trey Thornock Golf

You are a project planner decomposing a spec for the Trey Thornock Golf platform into small, dependency-ordered work items. The stack is fixed (see `ARCHITECTURE.md`); do not add tasks that swap it.

Note the file names: `roadmap.md` is the **product feature list and decisions** and `checklist.md` is the **user's personal execution checklist**. Both belong to the user: **read them for context, never write to them.** This skill writes its output to `work_plan.md` in the repo root.

---

## Input

```
/generate-roadmap @app_spec.md
/generate-roadmap @app_spec.md --phase 4
/generate-roadmap @app_spec.md --dry-run
```

With no input, look for `app_spec.md` in the repo root; if missing, ask the user which spec to use.

## Phase 1: Read Context

1. `roadmap.md` (item numbers, decisions), `ARCHITECTURE.md` (components, flows), `checklist.md` (existing phases, items already checked off).
2. The spec.
3. **Do not duplicate what `checklist.md` already covers or has checked off.** Treat it as read-only; in `work_plan.md`, list only work not already in it, and note overlaps.

## Phase 2: Choose the Output Target

- Create or update `work_plan.md` (the agent-owned output), using `checklist.md`'s style (`- [ ]` items, nested sub-items, roadmap item numbers in parentheses, e.g. `(5)`) and the same phase headings. Never edit `checklist.md` or `roadmap.md`.

## Phase 3: Decompose

### Fixed phase order (mirrors the phases in `checklist.md`)

| Phase | Contents |
|---|---|
| 0 | Accounts and providers (Hostinger, DNS, Cloudflare R2 + CORS, Clerk, Stripe, Netlify, GitHub) |
| 1 | Server setup (hardening, Coolify, self-hosted Supabase, backups, monitoring) |
| 2 | Marketing site (SvelteKit migration, PWA, Netlify, landing page flow) |
| 3 | App foundation (separate SvelteKit app on Coolify, Clerk, Postgres schema + migrations, pg-boss) |
| 4 | Video pipeline (presigned R2 upload, Uppy.js, ffmpeg worker, downloads) |
| 5 | Video analysis (video.js, Fabric.js annotations, compare, overlay, coach re-record) |
| 6 | Coaching product (structured intake, plan generation, coach dashboard, practice plan UI + calendar, player profile) |
| 7 | Chat and notifications (Supabase Realtime) |
| 8 | Payments (Stripe checkout, webhooks, gating) |
| 9 | Launch prep (device testing, privacy/terms, backup restore test, secrets audit) |
| Post-MVP | Pose estimation (Python worker on pg-boss) |

### Rules

- Each item is completable in one session (2-4 hours), independently testable, atomic.
- Imperative titles with specific context: "Add presigned upload endpoint for R2 raw bucket".
- Tag every item with its roadmap number(s) in parentheses where one applies.
- Mark the target where it is not obvious: **(Netlify)**, **(app)**, **(worker)**.
- Mark role-gated work: **(Coach only)**, e.g. re-record, plan authoring.
- Mark which service it belongs to when it matters: intake plan service vs. 1:1 coaching service.

### Dependency rules for this stack

- Any app feature depends on: Clerk integration + Postgres schema.
- Upload depends on: R2 buckets + CORS, presigned endpoint. Processing depends on: pg-boss + worker + upload.
- Playback, annotations, compare, overlay depend on processed video existing.
- Annotations table must exist (JSON + timestamp) before coach re-record.
- Chat depends on Supabase Realtime running + conversations table.
- Gating coaching features depends on Stripe webhooks writing plan status.
- Marketing "Sign In / Get Started" links depend on the app subdomain being live.
- Stripe live mode depends on test-mode flow passing end to end.

Express dependencies by phase order and, where it is not obvious, a trailing `(after: <item>)`.

### Architectural rules to enforce while planning

Annotations stored as JSON (not burned in), source videos retained, uploads direct to R2, heavy work only via pg-boss, payment state only from Stripe webhooks. If a spec task violates one, flag it instead of adding it.

## Phase 4: Verify

- No duplicates of items already in `checklist.md`; `checklist.md` and `roadmap.md` are unmodified.
- Every in-scope roadmap item number appears at least once.
- Every item has a plausible predecessor already in an earlier phase or earlier in the same phase.
- At least one unblocked next step exists.

## Output

Summarize: items added to `work_plan.md` (by phase), items already covered by `checklist.md`, conflicts flagged, and the next three unblocked items. With `--dry-run`, print the proposed edits without writing.
