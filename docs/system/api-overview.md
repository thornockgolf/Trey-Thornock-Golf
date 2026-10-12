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
| GET | `/videos/:id` | Video page: player (video.js with custom controls), sprite scrub preview, Download MP4 / original; shows status while processing; polls until ready | Owner or assigned coach (403 otherwise) |
| GET | `/videos`, `/videos/new` | Video library (polls status every 4 s while processing) and the upload screen | Signed in |
| GET | `/api/videos` | The caller's videos, newest first, with signed poster URLs for ready ones | Signed in |
| POST | `/api/videos` | Validate type and size (422), create a `pending` row (`kind` is `swing` by default; `kind: "reference"` is coach only (403 otherwise) and needs a title (422)), return a presigned PUT (< 50 MB) or start a multipart upload | Signed in |
| POST | `/api/videos/:id/upload-url` | A fresh presigned PUT for a still-`pending` single-request upload whose 15 min URL expired (409 for multipart or non-pending videos); the uploader calls it before a PUT when the URL is about to expire | Owner (403 otherwise) |
| POST | `/api/videos/:id/multipart/sign-part` | Presign one part | Owner (403 otherwise) |
| GET | `/api/videos/:id/multipart/parts?uploadId=` | Parts R2 already has, for resume | Owner |
| POST | `/api/videos/:id/multipart/complete` | Assemble the parts | Owner |
| POST | `/api/videos/:id/multipart/abort` | Cancel the multipart upload | Owner |
| POST | `/api/videos/:id/complete` | HEAD the object (409 if missing or oversize), set `uploaded`, enqueue `video.uploaded`. Repeating it is safe | Owner |
| GET | `/api/videos/:id/playback` | Signed GET (1 h) for the processed video, plus poster, sprite and sprite VTT URLs; 409 until `ready` | Owner or coach with an active assignment; any signed-in user for a reference video |
| GET | `/api/videos/:id/download?variant=processed\|original` | Signed GET with `Content-Disposition: attachment`; 422 on another variant | Owner or assigned coach; for a reference video, `processed` for any signed-in user and `original` for the owner only |
| POST | `/api/analyses` | Start an analysis of a video: `{ videoId, title? }`. 422 for a reference clip or a bad id; 404 unknown video; 403 for a video the coach may not see | Coach |
| GET | `/api/analyses/:id/overlay` | The saved overlay setup `{ analysisId, videoId, settings }` (defaults until saved) | Owner of the video or a coach who may see it |
| PUT | `/api/analyses/:id/overlay` | Save the overlay setup. The overlay video must be a reference clip or another video of the same owner (422 otherwise, even if the coach can see both); sync points must lie inside their videos | Coach |
| GET | `/api/analyses/:id/segments[?startMs=&endMs=]` | The segments that make up the analysis now; with a range, also `annotationsInRange` (how many annotations start inside it) so the coach can be asked to keep or remove them | Coach |
| POST | `/api/analyses/:id/segments` | Record or re-record `startMs`..`endMs`: `{ startMs, endMs, contentType, sizeBytes, annotations? }`. Creates a pending segment and a presigned PUT for the raw recording; nothing in the analysis changes yet. 422 for a bad range (under 0.5 s, over 15 min, past the video's end), type or size (100 MB); 409 while the video is not ready | Coach |
| POST | `/api/analyses/:id/segments/:segmentId/complete` | HEAD the recording (409 if missing or not a valid size), mark `uploaded`, queue `analysis.segment.uploaded`. Safe to repeat | Coach |
| GET | `/api/analyses/:id/segments/:segmentId` | One segment's status (`pending`/`uploaded`/`processing`/`ready`/`failed`, `errorCode`); the recorder polls it | Coach |
| POST | `/api/analyses/:id/segments/undo` | Reverse the latest re-record: its segments are replaced again, the ones it replaced are live again, removed annotations come back. 409 when there is nothing to undo or the change is over 30 days old | Coach |
| GET | `/api/analyses/:id/manifest` | The live segments in order with a signed clip URL (1 h): `{ startMs, endMs, clipStartMs, hasVideo, url }`, to play one after another alongside the video | Owner of the video or a coach who may see it |
| GET | `/compare` | Compare page: side by side (two players, independent sliders, Sync toggle, a sync point per video) or overlay (opacity, size, position); `?a=`, `?b=`, `?mode=overlay`, `?analysis=` | Signed in |
| GET | `/api/references` | The reference library with signed poster URLs. Players get ready clips; a coach also sees ones still processing or failed | Signed in |
| GET | `/coach/library` | Reference library page: upload form (same Uppy flow, title required) and the clips; polls while one processes | Coach (403 for players) |
| GET | `/api/videos/:id/annotations` | The video's annotations in timeline order: `{ annotations: AnnotationDto[] }` | Owner or assigned coach (403 otherwise) |
| POST | `/api/videos/:id/annotations` | Add one: `{ startMs, endMs, shape }`. 422 for a shape outside the allowlist, over 16 KB, a bad range (`endMs` before `startMs` or past the video's length), or the 100th-plus annotation; 409 if the video is not ready | Coach (must be assigned or own the video) |
| PATCH | `/api/videos/:id/annotations/:annotationId` | Change `startMs`, `endMs` and/or `shape`; the body carries the `version` the client saw. A stale version is 409 (reload and retry); an id from another video is 404 | Coach |
| DELETE | `/api/videos/:id/annotations/:annotationId[?version=n]` | Delete; with `version`, only if still current (409 otherwise) | Coach |
| GET | `/dev/shell`, `/dev/upload`, `/dev/videos`, `/dev/player`, `/dev/annotations`, `/dev/library`, `/dev/compare`, `/dev/mock-api/**` | Previews without Clerk, with a mock API for the real uploader code | Dev only (404 in production) |
| GET | `/offline.html`, `/manifest.webmanifest`, `/service-worker.js`, `/icons/*` | Static PWA files | Public |

Anonymous requests: pages get a 303 to `/sign-in`; `/api/*` gets 401 `{ "code": "NotAuthenticated", "message": "Sign in required" }`.

Error body for every failed API call: `{ code, message }` (a 422 for a bad request body names only the offending fields, for example `Invalid request: check sizeBytes`), with `code` one of `NotAuthenticated`, `Forbidden`, `NotFound`, `Conflict`, `ValidationError`, `PaymentError`, `StorageError`, `InternalError` (statuses 401, 403, 404, 409, 422, 402, 500).

## Planned (not built)

Routes in `docs/app_spec.md` section 5 and the screen list in section 6 (`/messages`, `/plans`, `/billing`, `/webhooks/stripe`, ...). Any coach-only API handler outside `/coach` must call `requireRole('coach')` itself; `coachGuard` only covers the `/coach` tree.

## Services available to handlers (not routes)

`R2` presigned PUT/multipart/GET/head, `Queue.send`, `Users`, `Videos` (rows, status transitions, `isAssignedCoach`, `listReferences`), `Annotations` (list, count, create, versioned update and delete; `packages/db/src/annotations.ts`), `Analyses` (create, find, set overlay, latest with overlay), `Segments` (pending, commit, undo, live list, retention queries), `Db`. Video logic is in `apps/app/src/lib/server/videos.ts`; `viewableVideo` (owner, assigned coach, or anyone for a reference video) and `ownedVideo` (owner only) are the access checks every video endpoint uses. The multipart endpoints use a key derived from the video id on the server, so an `uploadId` from the client can only act on that video's own object. See `docs/system/integrations.md`.

## Annotations

Handlers are in `apps/app/src/lib/server/annotations.ts`. The shape format (a discriminated union of `line`, `arrow`, `circle`, `angle`, `freehand`, `text`, version `v: 1`) and the request schemas are in `packages/shared/src/annotations.ts`. Coordinates are normalized: x is a fraction of the video width, y of its height; radius and stroke width are fractions of the width, text size a fraction of the height. Colours are limited to the five palette values. Decoding strips unknown properties, so only the allowlist is stored. Limits: 16 KB per shape, 500 freehand points, 200 text characters, 100 annotations per video. Only coaches write; a player who owns the video reads. On a reference video everyone signed in can read them and any coach can write (the library is the coach's). Annotations on analyses are not built yet.

## Compare and overlay

Compare state (which two videos, the Sync toggle, the sync points) lives in the page, not the database. Only the coach's overlay setup is stored: `analyses.overlay_settings` holds `{ overlayVideoId, opacity 0.1-1, scale 0.25-3, x and y -0.5 to 0.5 of the frame, baseSyncMs, overlaySyncMs }` (`packages/shared/src/analyses.ts`; unreadable stored JSON reads as the defaults). The video page links to the newest analysis of that video that has an overlay video chosen ("See your coach's comparison"). `/compare` loads the caller's ready swings and the ready references, plus any video named in `?a=`/`?b=` that they may see (a coach opening a player's video), and fetches playback URLs per video from `/api/videos/:id/playback`.

Sync is one controller (`packages/ui/src/lib/compare/sync.ts`) over two targets (a video.js player, or the overlay's plain `<video>`): play, pause, seek and rate move the other video by `tA - syncA + syncB`; the other video waits on its first frame until its sync window starts and holds its last frame after it ends; drift is corrected on every displayed frame once it passes one frame; programmatic seeks are remembered so their echo does not bounce back. While Sync is on, auto-replay is off and its toggle is hidden.

## Analysis recording (backend)

Handlers are in `apps/app/src/lib/server/segments.ts`; the timeline rule (`planReplace`) is in `packages/shared/src/segments.ts` and the transaction in `packages/db/src/segments.ts`. The timeline is the base video's time in ms. Live segments never overlap; gaps are allowed (silence). Re-recording a range replaces every live segment it overlaps; the parts of those segments outside the range stay as trimmed pieces (`clipStartMs` says where in the shared clip to start), so with a 0-30 s take, re-recording 10-15 s leaves 0-10 s and 15-30 s on the original object. The recorder UI, the player's sequential playback and a prompt in the browser are not built yet; the API already takes the keep/remove choice (`annotations`, default `keep`) and reports the count. Annotations are the video's (`annotations.video_id`), so removing them on re-record changes what the player sees on the video too; undo puts them back.
