# System reference

Current state of what is built, verified against the code on 2026-10-13 (branch `video-analysis`). Plans live in `docs/app_spec.md` and `docs/work_plan.md`; infrastructure decisions in `docs/ARCHITECTURE.md`. If this disagrees with the code, the code wins; fix the doc.

Last updated: 2026-10-13 (Part E: chat, notifications, payments, Realtime)

| File | Covers |
|---|---|
| [architecture.md](architecture.md) | Workspace layout, runtime stack and versions, request lifecycle, Effect conventions |
| [database-schema.md](database-schema.md) | Every table, column, constraint and index (generated from the migrated database) |
| [api-overview.md](api-overview.md) | Routes that exist today, who may call them, planned routes |
| [jobs-and-realtime.md](jobs-and-realtime.md) | pg-boss queues and the worker; Realtime and notifications |
| [feedback.md](feedback.md) | Temporary in-app feedback tickets: how it works, the flag, hand-off to an agent, how to remove it |
| [integrations.md](integrations.md) | Clerk, Postgres, R2, Stripe, Supabase Realtime, Netlify, Coolify, with env var names (never values) |

Repo-level docs: `README.md` (run, test, deploy), `CLAUDE.md` (rules for working in the repo), `docs/deploy.md` (Coolify), `docs/style-guide.md`.
