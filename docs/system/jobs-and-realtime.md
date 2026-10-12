# Jobs and Realtime

## Jobs (pg-boss 12, Postgres-backed)

Defined in `packages/shared/src/jobs.ts`; queue service in `packages/db/src/queue.ts`. pg-boss keeps its tables in the `pgboss` schema (created on start). The app is a producer (`Queue.layerFromUrl(url, { role: 'producer' })`); the worker is the consumer and runs pg-boss maintenance and schedules (`role: 'worker'`).

| Job | Payload | Producer | Consumer | Retry | Status |
|---|---|---|---|---|---|
| `video.uploaded` | `{ video_id }` | app (`/complete`, not built) | worker | 3 retries, 30 s initial delay, exponential backoff, then `failed`; active > 1 h is retried | Queue exists; no handler yet |
| `analysis.segment.uploaded` | `{ analysis_id, segment_id }` | app | worker | same | Queue exists; no handler |
| `analysis.assemble` | `{ analysis_id }` | app / worker | worker | same, active limit 30 min | Queue exists; no handler |
| `retention.sweep` | `{}` | scheduled `0 3 * * *` (registered when a handler is added) | worker | 1 retry, 5 min delay | Queue exists; no handler |

Entity queues use the `exclusive` policy with the entity id as `singletonKey`: at most one queued-or-active job per video, segment or analysis, so a repeated `/complete` does not queue a second transcode (`send` returns undefined for the duplicate). Payloads are validated with the schemas on send and on receive; an invalid payload never reaches a handler. A handler that fails (Effect failure or defect) hands the job back to pg-boss for retry.

Jobs for a queue with no consumer wait in Postgres.

## Worker (`apps/worker`)

Bun process (`bun src/main.ts`). Starts the queue, registers handlers from `src/handlers.ts` (empty now), serves an internal `GET /healthz` on `PORT` (default 8081; 503 until ready). No published port. On SIGTERM it stops pg-boss gracefully (finishes active jobs, up to 20 s) and exits 0. The image includes ffmpeg 7.1.

## Realtime

Not built. Planned channels (spec section 4): `conversation:{id}` and `user:{id}` on the self-hosted Supabase Realtime. Channel authorization is the one place authorization touches Postgres/Supabase.
