import { Effect } from 'effect';
import type { Queue, QueueError } from '@ttg/db';

/**
 * Register every job consumer. Part C adds `video.uploaded` (ffmpeg transcode, poster, sprite),
 * Part D `analysis.segment.uploaded` and the nightly `retention.sweep`. Until then jobs for those
 * queues wait in Postgres; nothing is lost.
 *
 * Add a handler like:
 *   yield* q.work('video.uploaded', (job) => processVideo(job.payload.video_id));
 * A failing Effect is retried by pg-boss per JOB_CONFIG (3 retries with backoff, then `failed`).
 */
export const registerHandlers: Effect.Effect<readonly string[], QueueError, Queue> = Effect.succeed([]);
