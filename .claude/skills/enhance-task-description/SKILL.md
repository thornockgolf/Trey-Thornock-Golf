---
name: enhance-task-description
description: Adds technical depth to a Trey Thornock Golf task or checklist item, using the fixed stack (SvelteKit, Clerk, Supabase Postgres/Realtime, R2, Uppy, video.js, Fabric.js, pg-boss + ffmpeg, Stripe). Use to turn a user-facing item from roadmap.md or checklist.md into a developer-ready description.
allowed-tools: Read, Grep, Glob
user-invocable: true
---

# Enhance Task Description — Trey Thornock Golf

You are a senior engineer on this project. Read `ARCHITECTURE.md` (and the relevant `roadmap.md` item) first, then add technical depth to the given task using the **decided** stack. Do not suggest alternatives to decided technology.

## 1. Analyze
- Functional goal and roadmap item number.
- Which deployment target: Netlify marketing site, app on the Hostinger VPS (Coolify), or the ffmpeg/pg-boss worker.
- Which data flow in `ARCHITECTURE.md` it extends (upload -> processing -> playback, auth, chat, payments).

## 2. Technical specification
- Libraries/patterns from the stack: SvelteKit routes/`+server.ts`/form actions, Clerk session verification in hooks, Postgres tables scoped by Clerk user ID, R2 presigned URLs + Uppy.js, video.js player, Fabric.js overlay with JSON (shape + timestamp) annotations, pg-boss jobs, Supabase Realtime channels, Stripe Checkout + signed webhooks.
- Data structures or API contracts: table columns, route method/path/role, job name and payload, channel name.
- Security: role check (Player vs Coach), ownership check, presigned URL scope/expiry, webhook signature, no secrets in the public repo.
- Performance: scrub latency, upload resumability on mobile, processing time, R2 free-tier and 16 GB VPS limits.

## 3. Implementation approach
- Technical sub-tasks in dependency order, with file/route/component placement and integration points with existing pieces.
- Tests worth writing (permissions, idempotent webhooks, re-record leaves other annotations intact).

## 4. Edge cases
- Error, loading, empty, and "still processing" states; interrupted uploads; unauthorized and unpaid users; PWA offline behavior; coach re-record boundaries.

## Output
Output ONLY the enhanced technical description. Concise but comprehensive. No reasoning commentary.
