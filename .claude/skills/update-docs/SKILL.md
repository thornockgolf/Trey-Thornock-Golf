---
name: update-docs
description: Keeps Trey Thornock Golf's docs (README.md, docs/ARCHITECTURE.md, docs/system/) accurate against the real code and infra as the SvelteKit app, worker, and Supabase schema get built. Use after significant changes (new tables, routes, worker jobs, integrations) or when docs feel stale.
allowed-tools: Read, Write, Edit, Grep, Glob, Bash, Task
user-invocable: true
---

# Update Documentation — Trey Thornock Golf

Keep the repo's documentation true to the code. Document only what you verified.

## Documents and Ownership

| File | Role | Policy |
|---|---|---|
| `docs/roadmap.md` | Product features and **decisions** (the user's own voice) | **Do not edit** unless the user asks. If code contradicts a decision, report it. |
| `docs/ARCHITECTURE.md` | System diagram, component table, data flows | Update when real components or flows diverge from it. Keep the mermaid diagram valid. |
| `docs/checklist.md` | The user's execution checklist | **Maintain it** (user instruction, 2026-10-12): tick items that are verifiably done. Keep their wording; don't tick items that need their accounts or access. List what you ticked in your summary. |
| `docs/app_spec.md` | MVP spec (what to build) | Don't rewrite it (owned by `/generate-app-spec`), but fix statements the build has made false (versions, API names, layout) and list the divergences in your summary. |
| `docs/work_plan.md` | Phased build plan | Tick items that are built and verified; don't regenerate it (owned by `/generate-roadmap`). Report stale items. |
| `docs/style-guide.md` | Design tokens, Skeleton theme, component guidance | Update when `packages/ui` (theme, tokens, components) diverges from it. |
| `README.md` | What is in the repo, how to run, deploy | Update as the static pages become a SvelteKit project: files, run/build commands, Netlify settings, verify steps. |
| `docs/system/` | Current-state reference (exists now) | Maintain per below. `database-schema.md` is generated from the migrated local database, not hand-written. |
| `docs/deploy.md` | Coolify settings, env var names, local image commands | Update when Dockerfiles or deploy settings change. |
| `CLAUDE.md` (repo root) | Rules and gotchas for working in the repo | Keep it true: current state, branch status, commands, conventions, gotchas. It is short rules and pointers; put detail in `docs/system/`. |

All project docs live in `docs/` (except `README.md` and `CLAUDE.md` at the repo root). Add new docs there.

`docs/system/` holds the verified current state (README index with Last Updated, architecture, database-schema, api-overview, jobs-and-realtime, integrations). Update the files an area touches; don't duplicate content between them and `docs/ARCHITECTURE.md` (which is the target design).

## Process

1. **Assess**: read the docs above. Note their style and what each currently claims.
2. **Discover** (verify, do not assume):
   - Stack and **actual versions** from `package.json` files (SvelteKit, Svelte, video.js, Fabric.js, Uppy, pg-boss, Stripe SDK, Clerk SDK).
   - Layout: marketing site vs. app vs. worker (separate projects/workspaces), route groups, `+server.ts` endpoints and form actions.
   - Data: migration files / `supabase/` schema for tables, columns, FKs, indexes, RLS or scoping by Clerk user ID.
   - Jobs: pg-boss queue names, producers, consumers, retry config.
   - Realtime: channels and subscribers.
   - Storage: R2 bucket names, key layout (raw / processed / thumbnails).
   - Integrations: Clerk, Stripe, R2, Supabase, with env var **names only**.
   - Infra: Coolify services, `docker-compose`/Dockerfiles, ports, domains (`treythornockgolf.com` on Netlify; `app.treythornockgolf.com` on the Hostinger VPS).
   For big areas, use subagents in parallel (data, API, worker, frontend).
3. **Update** the docs:
   - `docs/ARCHITECTURE.md`: reconcile diagram and data flows with reality; note any deviations from the roadmap decisions explicitly.
   - `README.md`: reflect current files, commands, deploy.
   - `docs/system/` (when it exists): `README.md` index with Last Updated, `architecture.md`, `database-schema.md` (per table: fields, types, keys, indexes, relationships), `api-overview.md` (routes by group with method/path/purpose/role), `jobs-and-realtime.md`, `integrations.md`.
4. **Verify**: every referenced path exists, links resolve, no duplicated content across files, "Last Updated" dates current, diagram still parses.

## Content Rules

1. Accuracy over completeness; current state only (plans live in `docs/roadmap.md`/`docs/checklist.md`, which you do not edit).
2. Real versions, not "latest".
3. **Never write secrets** (Clerk secret key, Stripe keys and webhook secret, R2 credentials, Supabase service role/JWT secrets). The repo is **public**; names of env vars only. Never copy anything from `.env`.
4. Call out each endpoint's required role (Player / Coach / webhook).
5. Flag, do not silently fix, anything that contradicts a roadmap decision (annotations as JSON, source video retained, uploads direct to R2, heavy work via pg-boss, payment state from webhooks).

## Proactive Use

After significant changes in a session (new table, route group, worker job, integration), offer to update the docs; for small, clearly-scoped changes just update the affected doc.
