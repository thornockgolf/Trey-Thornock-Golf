# API and routes

Verified against `apps/app/src/routes` on 2026-10-12. Role = who may call it. "Session" = a Clerk session (everything except the public routes below).

## Built

| Method | Path | Purpose | Role |
|---|---|---|---|
| GET | `/healthz` | Health check for Coolify (`{ "status": "ok" }`, no store) | Public |
| GET | `/api/me` | Current user `{ id, clerkUserId, role }`; creates the `users` row on first call | Any signed-in user |
| GET | `/sign-in`, `/sign-in/*` | Clerk sign-in component | Public |
| GET | `/sign-up`, `/sign-up/*` | Clerk sign-up component | Public |
| GET | `/` | Player home (placeholder) in the app shell | Signed in |
| GET | `/coach` | Coach dashboard (placeholder) | Coach (403 for players) |
| GET | `/dev/shell?role=&path=` | Shell preview without Clerk | Dev only (404 in production) |
| GET | `/offline.html`, `/manifest.webmanifest`, `/service-worker.js`, `/icons/*` | Static PWA files | Public |

Anonymous requests: pages get a 303 to `/sign-in`; `/api/*` gets 401 `{ "code": "NotAuthenticated", "message": "Sign in required" }`.

Error body for every failed API call: `{ code, message }`, with `code` one of `NotAuthenticated`, `Forbidden`, `NotFound`, `Conflict`, `ValidationError`, `PaymentError`, `StorageError`, `InternalError` (statuses 401, 403, 404, 409, 422, 402, 500).

## Planned (not built)

Routes in `docs/app_spec.md` section 5 and the screen list in section 6 (`/videos`, `/messages`, `/plans`, `/billing`, `/webhooks/stripe`, ...). Any coach-only API handler outside `/coach` must call `requireRole('coach')` itself; `coachGuard` only covers the `/coach` tree.

## Services available to handlers (not routes)

`R2` presigned PUT/multipart/GET/head, `Queue.send`, `Users`, `Db`. See `docs/system/integrations.md`.
