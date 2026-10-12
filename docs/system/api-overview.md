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
| GET | `/videos`, `/videos/new` | Video library (polls status every 4 s while processing) and the upload screen | Signed in |
| GET | `/api/videos` | The caller's videos, newest first, with signed poster URLs for ready ones | Signed in |
| POST | `/api/videos` | Validate type and size (422), create a `pending` swing row, return a presigned PUT (< 50 MB) or start a multipart upload | Signed in |
| POST | `/api/videos/:id/upload-url` | A fresh presigned PUT for a still-`pending` single-request upload whose 15 min URL expired (409 for multipart or non-pending videos); the uploader calls it before a PUT when the URL is about to expire | Owner (403 otherwise) |
| POST | `/api/videos/:id/multipart/sign-part` | Presign one part | Owner (403 otherwise) |
| GET | `/api/videos/:id/multipart/parts?uploadId=` | Parts R2 already has, for resume | Owner |
| POST | `/api/videos/:id/multipart/complete` | Assemble the parts | Owner |
| POST | `/api/videos/:id/multipart/abort` | Cancel the multipart upload | Owner |
| POST | `/api/videos/:id/complete` | HEAD the object (409 if missing or oversize), set `uploaded`, enqueue `video.uploaded`. Repeating it is safe | Owner |
| GET | `/api/videos/:id/playback` | Signed GET (1 h) for the processed video, plus poster, sprite and sprite VTT URLs; 409 until `ready` | Owner or coach with an active assignment |
| GET | `/api/videos/:id/download?variant=processed\|original` | Signed GET with `Content-Disposition: attachment`; 422 on another variant | Owner or assigned coach |
| GET | `/dev/shell`, `/dev/upload`, `/dev/videos`, `/dev/mock-api/**` | Previews without Clerk, with a mock API for the real uploader code | Dev only (404 in production) |
| GET | `/offline.html`, `/manifest.webmanifest`, `/service-worker.js`, `/icons/*` | Static PWA files | Public |

Anonymous requests: pages get a 303 to `/sign-in`; `/api/*` gets 401 `{ "code": "NotAuthenticated", "message": "Sign in required" }`.

Error body for every failed API call: `{ code, message }` (a 422 for a bad request body names only the offending fields, for example `Invalid request: check sizeBytes`), with `code` one of `NotAuthenticated`, `Forbidden`, `NotFound`, `Conflict`, `ValidationError`, `PaymentError`, `StorageError`, `InternalError` (statuses 401, 403, 404, 409, 422, 402, 500).

## Planned (not built)

Routes in `docs/app_spec.md` section 5 and the screen list in section 6 (`/videos/:id` player, `/messages`, `/plans`, `/billing`, `/webhooks/stripe`, ...). Any coach-only API handler outside `/coach` must call `requireRole('coach')` itself; `coachGuard` only covers the `/coach` tree.

## Services available to handlers (not routes)

`R2` presigned PUT/multipart/GET/head, `Queue.send`, `Users`, `Videos` (rows, status transitions, `isAssignedCoach`), `Db`. Video logic is in `apps/app/src/lib/server/videos.ts`; `viewableVideo` (owner or assigned coach) and `ownedVideo` (owner only) are the access checks every video endpoint uses. The multipart endpoints use a key derived from the video id on the server, so an `uploadId` from the client can only act on that video's own object. See `docs/system/integrations.md`.
