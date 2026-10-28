# API and routes

Verified against `apps/app/src/routes` on 2026-10-13. Role = who may call it. "Session" = a Clerk session (everything except the public routes below).

## Built

| Method | Path | Purpose | Role |
|---|---|---|---|
| POST | `/csp-report` | Receives CSP violation reports (report-only policy), logs a trimmed line, answers 204; body capped at 8 KB, rate limited | Public |
| GET | `/healthz/ready` | Readiness for the uptime monitor: `{ status: 'ok'|'degraded'|'down', db, queue: { waiting, oldestWaitingSeconds, failedLast24h } }`. 503 when Postgres is unreachable; `degraded` (200) when the queue can't be read or a job has waited over 15 min (worker stuck or down) | Public |
| GET | `/healthz` | Health check for Coolify (`{ "status": "ok" }`, no store) | Public |
| GET | `/api/me` | Current user `{ id, clerkUserId, role }`; creates the `users` row on first call | Any signed-in user |
| GET | `/sign-in`, `/sign-in/*` | Clerk sign-in component | Public |
| GET | `/sign-up`, `/sign-up/*` | Clerk sign-up component | Public |
| GET | `/` | Player home (placeholder) in the app shell | Signed in |
| GET | `/coach` | Coach dashboard (placeholder) | Coach (403 for players) |
| GET | `/videos/:id` | Video page: player (video.js with custom controls), sprite scrub preview, Download MP4 / original; shows status while processing; polls until ready. Below the player, the chat thread about this video (the player and their coach; only messages tied to it; an "Attach current time" toggle stamps a message and its chip seeks the player; "no coach yet" note instead for a player without one; none for reference clips) | Owner or assigned coach (403 otherwise) |
| GET | `/videos` | Video library (polls status every 4 s while processing); its Upload button opens the device file picker and uploads inline | Signed in |
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
| POST/GET | `/api/analyses/:id/export` | Coach, for a video they may see. POST asks for the flattened MP4 (video + annotations + commentary; the `analysis.assemble` job) and answers 202 with `{ status, requestedAt, readyAt, sizeBytes, errorCode, download }`; 409 when there is nothing to put in it; a request while one is queued or running changes nothing. GET gives the same, with a 15 minute presigned `download` when `ready` | Coach |
| POST | `/api/analyses/:id/segments/undo` | Reverse the latest re-record: its segments are replaced again, the ones it replaced are live again, removed annotations come back. 409 when there is nothing to undo or the change is over 30 days old | Coach |
| GET | `/api/analyses/:id/manifest` | The live segments in order with a signed clip URL (1 h): `{ startMs, endMs, clipStartMs, hasVideo, url }`, to play one after another alongside the video | Owner of the video or a coach who may see it |
| GET | `/coach/videos/:id/analyze` | The recorder page: the video with annotation tools and the coach's recordings playing along, a timeline of recordings, record or re-record a range (mic, optional camera), review, keep or remove annotations, save, undo. 404 for a reference clip | Coach (403 for players) |
| GET | `/compare` | Compare page: side by side (two players, independent sliders, Sync toggle, a sync point per video) or overlay (opacity, size, position); `?a=`, `?b=`, `?mode=overlay`, `?analysis=` | Signed in |
| GET | `/api/references` | The reference library with signed poster URLs. Players get ready clips; a coach also sees ones still processing or failed | Signed in |
| GET | `/coach/library` | Reference library page: upload form (same Uppy flow, title required) and the clips; polls while one processes | Coach (403 for players) |
| GET | `/api/videos/:id/annotations` | The video's annotations in timeline order: `{ annotations: AnnotationDto[] }` | Owner or assigned coach (403 otherwise) |
| POST | `/api/videos/:id/annotations` | Add one: `{ startMs, endMs, shape }`. 422 for a shape outside the allowlist, over 16 KB, a bad range (`endMs` before `startMs` or past the video's length), or the 100th-plus annotation; 409 if the video is not ready | Coach (must be assigned or own the video) |
| PATCH | `/api/videos/:id/annotations/:annotationId` | Change `startMs`, `endMs` and/or `shape`; the body carries the `version` the client saw. A stale version is 409 (reload and retry); an id from another video is 404 | Coach |
| DELETE | `/api/videos/:id/annotations/:annotationId[?version=n]` | Delete; with `version`, only if still current (409 otherwise) | Coach |
| GET | `/dev/shell`, `/dev/upload`, `/dev/videos`, `/dev/player`, `/dev/annotations`, `/dev/library`, `/dev/compare`, `/dev/analyze`, `/dev/mock-api/**` | Previews without Clerk, with a mock API for the real uploader code | Dev only (404 in production) |
| GET | `/questionnaire` | The intake stepper: draft save and resume, per-question validation, retake | Player |
| GET | `/api/questionnaire` | The form, the player's open draft and their latest completed response | Player |
| POST | `/api/questionnaire` | Save a draft, or submit (`submit: true`). A submit with a required question missing saves nothing and names the question (422). The first save after a completed response starts a new attempt; the old one is kept | Player |
| GET/POST | `/api/drills`, GET/PATCH `/api/drills/:id` | The drill library (seeded from the legacy page); 409 for a duplicate name | Coach |
| GET/POST | `/api/plans`, GET/PATCH `/api/plans/:id` | Plans: ordered sessions of 30, 45, 60 or 90 minutes, plus optional `structure.phases` (`{ id, title, description, measure?, fromLesson, toLesson }`, max 12, 1-based inclusive lesson ranges, ordered, non-overlapping, within the session count; always returned as an array; a PATCH that omits `phases` keeps the stored ones); drill minutes must add up to the session length exactly (422 otherwise); unknown drills are refused | Coach |
| POST | `/api/plans/:id/assign` | `{ playerId, startsOn, spacingDays? }`: creates the assignment, a dated session per plan session (items copied with the drill name) and a `plan_assigned` notification. 403 unless the coach has an active relationship with the player | Coach |
| GET | `/api/sessions` | The player's scheduled sessions, by date | Player |
| PATCH | `/api/sessions/:id/items/:itemId` | `{ completed }`: check one drill off (or undo); the session is done when every drill is. Someone else's session is 404 | Player |
| GET | `/api/home` | `HomeDto`: the active assignment with the latest start date, the current lesson (today's session, else next upcoming, else earliest overdue, else null) as "Lesson N of M", and the plan's phases with `done/current/upcoming` state. Empty for a player with no plan | Player |
| GET | `/` | Player Home: `HomeDto` as page data (coaches redirect to `/coach`); the UI is still the placeholder | Player |
| GET | `/plans` | The player's plan: today's session on top, then (when the active plan has phases) one collapsible section per phase (title, lesson range, date range, X of Y done, "why it matters" and measure; the current phase is open, others closed; sessions outside every phase go under "Other sessions"); without phases, coming up and earlier as before. Load is `plansPageData`: `{ sessions, phases, lessonBySession }` (`PlansPageDto`; `GET /api/sessions` is unchanged). Drill cards | Player |
| GET | `/coach/plans` | Plan composer (title, sessions, drill picker with live totals and "put the rest on the last drill", save, assign) and the drill editor. Below the sessions, a "Roadmap phases" editor (`PhasesEditor.svelte`): title, "Why it matters" (written to the player), optional "How we measure it", lesson from/to, add/remove/up-down (up/down swap the wording and keep the lesson ranges in order), a coverage strip with gaps; validated inline with `phaseIssues`, always sent on save | Coach |
| GET | `/coach` | Dashboard: players, new swing videos this week, sessions coming up; add players who have signed up | Coach |
| GET | `/coach/players/:id` | A player's profile, private notes, questionnaire (in words), plan progress, calendar, check-ins and tests with scheduling tools, videos. 403 unless assigned | Coach |
| GET | `/api/players` | Every player and whether the coach works with them (counts for the dashboard) | Coach |
| POST | `/api/players/:id/delete` | Permanently delete a player's account (body `{ "confirm": true }`): locks it, deletes the Stripe customer and the Clerk user, queues `account.delete`; 502 `UpstreamError` if Stripe or Clerk fails (retry); 404 for a coach or unknown id | Coach |
| POST | `/api/players/:id/assign`, `/unassign` | Start, resume or end coaching a player (history stays); 404 for an id that is not a player | Coach |
| GET/POST | `/api/players/:id/notes` | The coach's private notes on an assigned player. Never returned to players (players get 403, and no profile or player-facing response contains them) | Coach |
| GET | `/calendar` | Month, week and list calendar of sessions, check-ins and tests; the check-in form | Player |
| GET | `/api/calendar` | `{ sessions, checkIns, results }`; a coach adds `?playerId=` for an assigned player (403 otherwise, 422 when none is named) | Signed in |
| GET/POST | `/api/check-ins` | List (same scoping as the calendar); a coach schedules for an assigned player `{ playerId, scheduledOn, repeatWeeks? }` and the player is notified | Signed in / Coach |
| PATCH | `/api/check-ins/:id` | The player submits their own: `{ answers: { roundsPlayed 0-30, confidence 1-5, issues?, videoId? } }`, once (409 after); a video must be theirs. Their coaches get a `check_in_submitted` notification | Player |
| GET/POST | `/api/assessments` | Tests: a coach sees all and defines new ones (409 duplicate name); a player sees those they have a result or schedule for | Signed in / Coach |
| POST | `/api/assessments/:id/schedule` | Put a test on an assigned player's calendar | Coach |
| GET/POST | `/api/assessments/:id/results` | A player's results of one test over time, each with the previous value and trend (own, or `?playerId=` for a coach); the coach records a value for a scheduled result (`resultId`) or ad hoc; the player gets an `assessment_result` notification | Signed in / Coach |
| GET | `/profile` | The player's profile: photo, handicap, hand, home course, goals, equipment, limitations, and a summary (swing videos, current plan progress, subscription status) | Player |
| GET/PUT | `/api/profile` | Own profile; PUT changes the fields sent (null or empty clears one); handicap -10 to 54 (422 otherwise); never includes coach notes | Player |
| POST | `/api/profile/photo`, `/api/profile/photo/complete` | A presigned PUT for the player's own key (`profile/{id}/photo.{jpg,png,webp}`, 5 MB, image types only), then a HEAD check (409 if missing or the wrong size) before it is used; the profile returns a signed URL, never the key | Player |
| GET | `/dev/plans`, `/dev/coach`, `/dev/coach-player`, `/dev/calendar`, `/dev/profile`, `/dev/home` (`?state=rest|done|empty`), `/dev/player-plans` (`?lesson=N`, `?plain=1`) | Previews against an in-memory mock of these APIs | Dev only |
| GET | `/api/conversations` | The user's conversations with the other person. `lastMessage` and `unread` are for the general thread only; `videoUnread` and `videoUnreadVideoId` count unread messages tied to videos | Signed in |
| GET | `/api/conversations/:id/messages[?after=seq\|before=seq&limit=n][&videoId=uuid\|scope=general]` | Messages oldest first (default newest 50, max 100); `after` is the catch-up cursor. `videoId` returns only that video's thread, `scope=general` only messages tied to no video (the Messages tab); neither returns all. 404 unknown id, 403 for anyone not in it, 422 bad cursor or thread | Participant |
| POST | `/api/conversations/:id/messages` | `{ body, videoId?, videoMs? }` (a message with `videoId` belongs to that video's thread): 1-4000 characters after trimming; a video must be the player's own or a reference clip and `videoMs` needs it (422). 403 once coaching has ended; 402 `{ code, message, billingUrl }` for a player without an active membership (past_due counts for 7 days); 429 over 30 a minute. Publishes `message.created` | Participant (player needs the membership) |
| POST | `/api/conversations/:id/read[?videoId=uuid\|scope=general]` | The user opened a thread (without a query, all of them): marks the other side's messages in it read and clears that thread's message notification; returns the unread counts | Participant |
| GET | `/api/unread` | `{ messages, notifications }` counts from Postgres, for the badges; `messages` includes unread video-thread messages | Signed in |
| GET | `/api/push` | `{ enabled, publicKey }`: whether web push is set up (VAPID keys) and the key a browser subscribes with | Signed in |
| POST | `/api/push/subscribe`, `/api/push/unsubscribe` | Save or forget this browser's push subscription for the session's user (`{ endpoint, keys: { p256dh, auth } }` / `{ endpoint }`). The endpoint must be https on a known push service (FCM, Mozilla, Apple, Windows; else 422, because the server posts to it); 409 when push is off; at most 10 per user; unsubscribe only removes the caller's own | Signed in |
| GET/PATCH | `/api/notifications` | Own notifications newest first with `unread`; `{ ids }` or `{ all: true }` marks read (other people's ids are ignored) | Self |
| POST | `/api/realtime/token` | `{ channel: 'conversation', conversationId }` or `{ channel: 'user' }` -> a 5 minute token for exactly that channel, or `{ enabled: false }` when Realtime is not configured | Participant / self |
| GET | `/api/billing` | `BillingDto` read from Postgres: assessment paid, subscription, entitlements, payments | Player (403 for coaches) |
| POST | `/api/billing/checkout` | `{ product: 'assessment' \| 'membership' }` -> `{ url }` of Stripe Checkout. 409 if already paid / already a member / membership before the assessment; 402 when Stripe is not configured | Player |
| POST | `/api/billing/portal` | `{ url }` of the Customer Portal; 409 before any Checkout | Player |
| POST | `/webhooks/stripe` | Raw body, `Stripe-Signature` checked (400 and nothing written when invalid), each event id handled once; writes `payments`, `subscriptions`, pairing and `payment_issue` notifications. 500 on failure so Stripe retries | Stripe (no session) |
| GET | `/messages`, `/messages/:id`, `/messages/new` | Chat (general messages only; messages about a video are written on that video's page): list and thread side by side from lg; a player's `/messages` opens their one conversation; `/messages/new` (a coach adds `?player=`) finds or creates the conversation. A list entry with unread video messages links to that video | Signed in |
| GET | `/notifications`, `/billing` | The notification list; the billing page (state from Postgres, `?checkout=success` only shows a confirming notice) | Signed in / Player |
| GET | `/videos/:id?t=ms` | (existing page) opens at that time, from a chat message's video chip | Owner or assigned coach |
| GET | `/dev/messages`, `/dev/billing`, `/dev/notifications` | Previews against an in-memory mock of chat, notifications and billing (`?as=coach`, `?lock=payment`, `?stage=new\|assessment\|member\|past_due`) | Dev only |
| GET | `/offline.html`, `/manifest.webmanifest`, `/service-worker.js`, `/icons/*` | Static PWA files | Public |

Anonymous requests: pages get a 303 to `/sign-in`; `/api/*` gets 401 `{ "code": "NotAuthenticated", "message": "Sign in required" }`.

Error body for every failed API call: `{ code, message }` (a 422 for a bad request body names only the offending fields, for example `Invalid request: check sizeBytes`), with `code` one of `NotAuthenticated`, `Forbidden`, `NotFound`, `Conflict`, `ValidationError`, `PaymentError`, `RateLimited`, `StorageError`, `UpstreamError`, `InternalError` (statuses 401, 403, 404, 409, 422, 402, 429, 500, 502). A 402 also carries `billingUrl`.

## Feedback tickets (temporary dev tool)

Outside Parts A-G; see [feedback.md](feedback.md). Behind `PUBLIC_FEEDBACK_ENABLED`: with the flag off every route here answers 404.

| Method | Path | Purpose | Who |
|---|---|---|---|
| GET/POST | `/api/feedback` | List (`?status=&type=`; a coach sees all tickets, anyone else only their own, newest first) / file a ticket `{ title 1-120, body 1-4000, type bug\|change\|idea, priority?, pagePath?, viewport?, userAgent? }`; the role is taken from the session | Signed in |
| GET/PATCH | `/api/feedback/:id` | Read (someone else's ticket is 404 for a non-coach) / change. The author edits `title`, `body`, `type`, `priority` while the ticket is open (409 after, 403 for others); only a coach sets `status` (open, in_progress, done, wont_do) and `resolutionNotes` (403 otherwise) | Signed in |
| GET | `/api/feedback/export[?status=open\|in_progress\|done\|wont_do\|all]` | Markdown for a coding agent (default `open`): one section per ticket, high priority first. Same text as `bun run feedback:export` | Coach |
| GET | `/feedback`, `/dev/feedback` (`?role=coach`) | The ticket list and review page (the floating Feedback button is in the app shell); dev preview uses an in-memory mock API | Signed in / dev |

## Planned (not built)

Not built: the self-serve plan generator. Any coach-only API handler outside `/coach` must call `requireRole('coach')` itself; `coachGuard` only covers the `/coach` tree.

## Services available to handlers (not routes)

`R2` presigned PUT/multipart/GET/head, `Queue.send`, `Users`, `Videos` (rows, status transitions, `isAssignedCoach`, `listReferences`), `Annotations` (list, count, create, versioned update and delete; `packages/db/src/annotations.ts`), `Questionnaires`, `Drills`, `Plans` (assignment, sessions), `Coaching` (players, assign, notes), `CheckIns`, `Assessments`, `Profiles`, `Analyses` (create, find, set overlay, latest with overlay), `Segments` (pending, commit, undo, live list, retention queries), `Accounts` (deletion request, status, R2 keys, erase), `ClerkAdmin` (delete a Clerk user, from `clerkClient`), `StripeApi.deleteCustomer`, `Db`. Video logic is in `apps/app/src/lib/server/videos.ts`; `viewableVideo` (owner, assigned coach, or anyone for a reference video) and `ownedVideo` (owner only) are the access checks every video endpoint uses. The multipart endpoints use a key derived from the video id on the server, so an `uploadId` from the client can only act on that video's own object. See `docs/system/integrations.md`.

## Annotations

Handlers are in `apps/app/src/lib/server/annotations.ts`. The shape format (a discriminated union of `line`, `arrow`, `circle`, `angle`, `freehand`, `text`, version `v: 1`) and the request schemas are in `packages/shared/src/annotations.ts`. Coordinates are normalized: x is a fraction of the video width, y of its height; radius and stroke width are fractions of the width, text size a fraction of the height. Colours are limited to the five palette values. Decoding strips unknown properties, so only the allowlist is stored. Limits: 16 KB per shape, 500 freehand points, 200 text characters, 100 annotations per video. Only coaches write; a player who owns the video reads. On a reference video everyone signed in can read them and any coach can write (the library is the coach's). Annotations on analyses are not built yet.

## Compare and overlay

Compare state (which two videos, the Sync toggle, the sync points) lives in the page, not the database. Only the coach's overlay setup is stored: `analyses.overlay_settings` holds `{ overlayVideoId, opacity 0.1-1, scale 0.25-3, x and y -0.5 to 0.5 of the frame, baseSyncMs, overlaySyncMs }` (`packages/shared/src/analyses.ts`; unreadable stored JSON reads as the defaults). The video page links to the newest analysis of that video that has an overlay video chosen ("See your coach's comparison"). `/compare` loads the caller's ready swings and the ready references, plus any video named in `?a=`/`?b=` that they may see (a coach opening a player's video), and fetches playback URLs per video from `/api/videos/:id/playback`.

Sync is one controller (`packages/ui/src/lib/compare/sync.ts`) over two targets (a video.js player, or the overlay's plain `<video>`): play, pause, seek and rate move the other video by `tA - syncA + syncB`; the other video waits on its first frame until its sync window starts and holds its last frame after it ends; drift is corrected on every displayed frame once it passes one frame; programmatic seeks are remembered so their echo does not bounce back. While Sync is on, auto-replay is off and its toggle is hidden.

## Analysis recording

Handlers are in `apps/app/src/lib/server/segments.ts`; the timeline rule (`planReplace`) is in `packages/shared/src/segments.ts` and the transaction in `packages/db/src/segments.ts`. The timeline is the base video's time in ms. Live segments never overlap; gaps are allowed (silence). Re-recording a range replaces every live segment it overlaps; the parts of those segments outside the range stay as trimmed pieces (`clipStartMs` says where in the shared clip to start), so with a 0-30 s take, re-recording 10-15 s leaves 0-10 s and 15-30 s on the original object. The API takes the keep/remove choice for annotations (`annotations`, default `keep`) and reports how many start inside a range. Annotations are the video's (`annotations.video_id`), so removing them on re-record changes what the player sees on the video too; undo puts them back.

**Recorder (`apps/app/src/lib/analysis`).** `AnalysisRecorder` records with `MediaRecorder` (WebM/Opus where supported, MP4 on Safari; 64 kbps audio, 800 kbps camera), muting and playing the video from the start of the chosen range at normal speed. The take is the part of the video that played while recording: it ends at the chosen end, when the coach presses Stop, or when the video is paused. After the take the coach reviews it, answers the keep/remove question if the part already has a recording with annotations in it, and saves: the app creates the analysis on the first save, creates the pending segment, PUTs the recording to the presigned URL, completes it, and polls the segment until the worker marks it `ready` or `failed` (a failed take leaves the earlier recording as it was). Undo calls `POST .../segments/undo`. The page creates nothing until the first save.

**Playback.** `AnnotatedPlayer` (on `/videos/:id` and the recorder page) fetches the manifest of the analysis and mounts `CommentaryAudio`, which keeps one hidden media element per distinct clip and moves them with the video (`CommentarySync` in `packages/ui`): the active segment's clip plays at `timeline - start + clipStart`, a clip further than 250 ms off is moved, everything is silent in gaps, and a camera clip shows as a picture-in-picture while its segment is active. A player sees the commentary read-only, from the newest analysis of their video that has a live recording (`Analyses.latestWithRecording`). The commentary does not lower the video's own sound.

## Coaching product (Part F)

Who may see what is decided in the app server. A coach reaches a player's data only through an active row in `coach_assignments` (made with `POST /api/players/:id/assign`; a paid assessment now pairs the player with the longest-standing coach if they have none; the coach can still assign players by hand). Everything per-player on the coach side goes through `assignedPlayer` (404 for an id that is not a player, 403 for one that is not assigned). A player can only read and write their own sessions, check-ins, results and profile, because those endpoints take the player from the session, not from the request. Notifications are written as rows (`plan_assigned`, `check_in_scheduled`, `check_in_submitted`, `assessment_result`); the bell and Realtime are Phase 7. A player's name comes from their own profile (Clerk's name is not synced), so until they fill it in the coach sees their email, or a short id.
