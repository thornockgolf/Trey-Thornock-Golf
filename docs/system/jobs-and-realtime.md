# Jobs and Realtime

## Jobs (pg-boss 12, Postgres-backed)

Defined in `packages/shared/src/jobs.ts`; queue service in `packages/db/src/queue.ts`. pg-boss keeps its tables in the `pgboss` schema (created on start). The app is a producer (`Queue.layerFromUrl(url, { role: 'producer' })`); the worker is the consumer and runs pg-boss maintenance and schedules (`role: 'worker'`).

| Job | Payload | Producer | Consumer | Retry | Status |
|---|---|---|---|---|---|
| `video.uploaded` | `{ video_id }` | app (`POST /api/videos/:id/complete`) | worker | 3 retries, 30 s initial delay, exponential backoff, then `failed`; active > 1 h is retried | Built |
| `analysis.segment.uploaded` | `{ analysis_id, segment_id }` | app (`POST /api/analyses/:id/segments/:segmentId/complete`) | worker | same | Built |
| `analysis.assemble` | `{ analysis_id }` | app / worker | worker | same, active limit 30 min | Queue exists; no handler |
| `account.delete` | `{ user_id }` | app (`POST /api/players/:id/delete`, held back 16 min) | worker | same, active limit 30 min | Built (see below) |
| `retention.sweep` | `{}` | scheduled `0 3 * * *` (registered by the worker) | worker | 1 retry, 5 min delay | Abandoned video uploads, then replaced and abandoned coach recordings (see below) |

Entity queues use the `exclusive` policy with the entity id as `singletonKey`: at most one queued-or-active job per video, segment or analysis, so a repeated `/complete` does not queue a second transcode (`send` returns undefined for the duplicate). Payloads are validated with the schemas on send and on receive; an invalid payload never reaches a handler. A handler that fails (Effect failure or defect) hands the job back to pg-boss for retry.

Jobs for a queue with no consumer wait in Postgres.

## Worker (`apps/worker`)

Bun process (`bun src/main.ts`). Fails at start naming any missing env var (`DATABASE_URL`, `R2_*`). Registers `video.uploaded`, `analysis.segment.uploaded`, `account.delete` and `retention.sweep` (job concurrency `WORKER_CONCURRENCY`, default 1, max 2) and serves an internal `GET /healthz` on `PORT` (default 8081; 503 until ready). On SIGTERM it stops pg-boss gracefully (up to 20 s) and exits 0. The image includes ffmpeg 7.1. Other env: `WORK_DIR` (default `/tmp/ttg-work`), `FFMPEG_THREADS` (2), `FFMPEG_TIMEOUT_MS` (30 min).

### `video.uploaded` (`src/process-video.ts`)

Claims the row (`uploaded` or `processing` -> `processing`), downloads the source to a per-job temp dir (always removed), probes it, transcodes to H.264/AAC MP4 (`+faststart`, at most 1080p, constant frame rate, keyframe every 0.5 s), then writes `processed/{id}/video.mp4`, `poster.jpg`, `sprite.jpg` and `sprite.vtt` (overwriting, so retries are idempotent) and sets `ready` with duration (integer ms), fps, width and height. It never deletes anything in R2, and the source is kept. The worker's `Storage` can delete only `analysis/` keys for the retention sweep below, and a closed account's files for `account.delete` (below); otherwise videos are never deleted. The sprite VTT refers to `sprite.jpg` relatively; the player must rewrite it to a signed URL.

Failure policy: a video longer than 5 min (+1 s grace) or with no source key is `failed` at once (`DURATION_EXCEEDED`, `SOURCE_MISSING`). Anything else (`INVALID_VIDEO`, `DOWNLOAD_FAILED`, `TRANSCODE_FAILED`, `UPLOAD_FAILED`, `PROCESSING_FAILED`) is rethrown so pg-boss retries and the row stays `processing`; on the last attempt (`isLastAttempt`, from `retryCount`/`retryLimit` on `Job`) the row becomes `failed`. An interrupted job (shutdown, lost claim) records nothing and is retried. If the worker dies during the final attempt, pg-boss expires the job to `failed` without running the handler; a sweep in the worker (`stalledSweeper`, every 5 min, `Videos.failStalled`) then sets `failed` / `PROCESSING_STALLED` on any `processing` video older than 10 min that has no `created`, `retry` or `active` `video.uploaded` job in `pgboss.job`.

### `retention.sweep` (`src/retention.ts`)

Nightly at 03:00. For each video still `pending` after 24 h (the presigned PUT lasts 15 min, so the upload was abandoned): if the source object is in R2 (the browser finished but never called `/complete`), mark it `uploaded` and queue `video.uploaded`; if the object is empty or over the limit, mark the row `failed` (`INVALID_UPLOAD`); if there is no object, delete the row. No R2 object is ever deleted. A row whose R2 check errors is skipped and retried the next night. Incomplete multipart parts are not tracked by us (the `uploadId` is not stored): set an R2 lifecycle rule "abort incomplete multipart uploads after 1 day" on the bucket so they don't accrue storage.

### `analysis.segment.uploaded` (`src/process-segment.ts`)

Claims the segment row (`uploaded` or `processing` -> `processing`), downloads the browser's raw recording (`analysis/{analysis}/{segment}.raw.{webm|mp4|ogg}`), probes it (a MediaRecorder WebM has no duration in its header, so the length is measured by decoding), and normalizes it to MP4/AAC at exactly the slot's length (`end_ms - start_ms`): a recording up to 2 s short is padded (silence, the last picture held), a long one is cut, and a much shorter one fails at once as `SEGMENT_TOO_SHORT`. A recording with a camera becomes H.264 (at most 1280 wide, 30 fps) plus AAC; audio only becomes AAC in MP4. It uploads `analysis/{analysis}/{segment}.mp4`, re-probes it, and then `Segments.commit` makes the segment live in one transaction: the live segments it overlaps are marked replaced (their parts outside the range stay as trimmed pieces of the same clip, so those objects are untouched), and with `annotations_action = 'remove'` the video's annotations that start in the range are deleted and kept on the row for undo. Until the commit the previous segments stay live, so a failed or cancelled recording changes nothing. The raw recording is kept.

Failure policy is the video one: `SEGMENT_TOO_SHORT` and `SOURCE_MISSING` are final; `INVALID_RECORDING`, `DOWNLOAD_FAILED`, `TRANSCODE_FAILED`, `UPLOAD_FAILED` and `PROCESSING_FAILED` are retried and mark the row `failed` on the last attempt. The stalled sweep (every 5 min) also fails `processing` segments whose job is gone (`PROCESSING_STALLED`).

### `retention.sweep` for recordings (`src/retention.ts`)

After the abandoned-upload step, deletes segment rows that were replaced (or undone) more than 30 days ago and recordings that never finished (pending, failed or stuck) for over a day. For each row the raw recording and the normalized clip are deleted from R2 first, unless another row still points at the same object (a trimmed piece shares its parent's clip), then the row. A failure on one row is logged and left for the next night. The worker's `Storage` can delete only `analysis/` keys (it refuses anything else, including `..`), so source and processed videos are never touched.

## Realtime

Channels are private Supabase Broadcast channels: `conversation:{id}` (event `message.created`, payload a `MessageDto`) and `user:{id}` (`notification.created` with a `NotificationDto`, `video.ready` and `video.failed`). Every write goes to Postgres first; the push only says "look again", so a missed push costs nothing: pages poll when the socket is not live and catch up by `seq` cursor.

- **Publishing** (`Realtime` in `packages/db/src/realtime.ts`): `POST {PUBLIC_SUPABASE_URL}/realtime/v1/api/broadcast` with the service role key, `private: true`. Best effort, one warning a minute on failure. The app publishes on send (`message.created`, and `notification.created` for the recipient) and from the Stripe webhook; the worker publishes `video.ready`/`video.failed` and `analysis_ready` notifications after the transaction that wrote them.
- **Receiving**: `POST /api/realtime/token` checks the caller may be on the channel (a conversation's two people, or their own user channel) and returns an HS256 JWT (`role: authenticated`, `sub`, `topic`, 5 minutes) signed with `SUPABASE_JWT_SECRET`. The browser (`apps/app/src/lib/realtime/realtime-client.ts`, `@supabase/realtime-js`) joins with it and asks again a minute before expiry.
- **Policy** (the only database-side authorization): migration 0010's `app.install_realtime_policies()` creates `ttg_channel_read` on `realtime.messages` for `authenticated`: `realtime.topic() = auth.jwt() ->> 'topic'`. Idempotent; rerun it if Realtime creates its schema after the migration. There is no insert policy: only the service role publishes.
- **Off switch**: without the four Supabase variables the token endpoint answers `{ enabled: false }`, publishing does nothing, and the chat polls every 5 s, the badges every 30 s, the library and player every 4 s.
- **Status**: tested with stand-ins (token, publish request, policy SQL against stub `realtime.*`/`auth.jwt()`, client against a fake socket). Never run against a real Realtime server: the local Supabase settings are placeholders.

Notifications are written in the same transaction as what they announce (`insertNotification` in `packages/db/src/notifications.ts`): new message (one unread row per conversation), video ready/failed (`Videos.markReady/markFailed`, once), analysis ready (`Segments.commit`, once per analysis), plan assigned, check-in scheduled/submitted, test result, payment issue, coach assigned and new player (webhook).

## Web push (optional)

Browser notifications for the installed app, for the same notifications the bell shows. Off unless `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT` are set (app and worker; `docs/deploy.md`).

- **Subscribing**: on `/notifications` a person taps "Turn on alerts" (never on page load); the browser asks permission, `pushManager.subscribe` runs, and `POST /api/push/subscribe` stores it in `push_subscriptions` (migration 0013) for the session's user. The server later POSTs to the endpoint the client named, so only https endpoints on the known push services are accepted. iOS only offers push to an app installed to the home screen.
- **Sending**: `WebPush.notify` (`packages/db/src/push.ts`, the `web-push` library) runs where Realtime already publishes: `publishNotifications` in the app (detached, so a slow push service never delays a response) and `publishJobNotification` in the worker (`video_ready`, `video_failed`, `analysis_ready`). The payload is only the bell's title and link plus a tag (one per conversation), never message text. A 404/410 from the push service deletes the subscription; any other failure is logged and dropped.
- **Service worker** (`apps/app/src/service-worker.ts`): `push` shows the notification, `notificationclick` focuses an open window or opens the link (same origin only). It still caches only the static shell.
- **Account deletion** removes the player's subscriptions (`Accounts.erase`).
- **Status**: tested with a recording sender in place of the push service (subscription storage, the 403/422 rules, payloads, gone-subscription cleanup, the send from a chat message on a real database) and the toggle in a browser with stubbed Push APIs. **Never delivered to a real browser or phone**: that needs real VAPID keys, an installed PWA over https and a real device.

### `account.delete` (`src/process-account-delete.ts`)

A coach deletes a player with `POST /api/players/:id/delete` (body `{ "confirm": true }`, button on the player page). The app locks the account first (`users.deletion_requested_at`: the player disappears from the coach's list and `currentUser` answers 403), then deletes the Stripe customer (cancels the subscription), then the Clerk user (ends the sessions), then queues this job with a 16 minute delay so a presigned upload still in flight lands before the files are listed. Each app step is safe to repeat; a Stripe or Clerk failure answers 502 `UpstreamError` and queues nothing, and the coach tries again.

The job does nothing unless deletion was requested (`Accounts.status`). It lists the player's R2 keys from their rows (source, processed video, poster, sprite and VTT, coach recordings, profile photo), deletes them (`Storage.deleteAccountObject`: only `raw/`, `processed/`, `analysis/` and `profile/` keys), then `Accounts.erase` deletes the rows in one transaction: notifications (the player's, plus the coach's that point at their videos, analyses, conversation or check-ins), messages and the conversation, annotations, segments, analyses, videos, plan sessions and assignments, check-ins, assessment results, questionnaire, profile, coach notes and the assignment. Files go first and the keys come from the rows, so a retry after a failure finds the same keys. **Kept**: `payments`, `subscriptions` and `stripe_customers` (accounting), on the `users` row, which stays as a tombstone: `clerk_user_id` becomes `deleted:<id>`, name and email are cleared, `deleted_at` is set. A new sign-up with the old Clerk id is a new account. Only the files named by the player's own rows are removed; coach-owned reference clips are never touched. Multipart parts that were never completed are not tracked (the R2 lifecycle rule for incomplete uploads covers them).
