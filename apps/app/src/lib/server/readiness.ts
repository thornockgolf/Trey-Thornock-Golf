import { Db } from '@ttg/db';
import { Effect } from 'effect';

/** A job waiting this long (it should have started) means the worker is stuck or down. */
export const BACKLOG_DEGRADED_SECONDS = 15 * 60;

export interface Readiness {
	readonly status: 'ok' | 'degraded' | 'down';
	readonly db: boolean;
	/** `null` when the queue tables could not be read. */
	readonly queue: { readonly waiting: number; readonly oldestWaitingSeconds: number; readonly failedLast24h: number } | null;
}

const json = (body: Readiness, status: number) =>
	new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

/**
 * `GET /healthz/ready`, for the external uptime monitor (the plain `/healthz` stays dependency-free so Coolify
 * does not restart the app when only the database is down). 503 when Postgres is unreachable; 200 `degraded` when
 * the queue cannot be read or a job has been waiting over 15 minutes (the worker is not taking jobs); otherwise 200 `ok`.
 * Failed jobs in the last 24 hours are reported but do not degrade it. Public and read-only; reveals counts only.
 */
export const readiness = Effect.gen(function* () {
	const db = yield* Db;
	const alive = yield* db.query('select 1').pipe(Effect.as(true), Effect.orElseSucceed(() => false));
	if (!alive) return json({ status: 'down', db: false, queue: null }, 503);
	const queue = yield* db
		.maybeOne<{ waiting: string; oldest: number | null; failed: string }>(
			`select count(*) filter (where state in ('created', 'retry') and start_after <= now()) as waiting,
			        coalesce(extract(epoch from now() - min(start_after) filter (where state in ('created', 'retry') and start_after <= now()))::int, 0) as oldest,
			        count(*) filter (where state = 'failed' and completed_on > now() - interval '24 hours') as failed
			   from pgboss.job`
		)
		.pipe(Effect.orElseSucceed(() => undefined));
	if (!queue) return json({ status: 'degraded', db: true, queue: null }, 200);
	const stats = { waiting: Number(queue.waiting), oldestWaitingSeconds: Number(queue.oldest ?? 0), failedLast24h: Number(queue.failed) };
	return json({ status: stats.oldestWaitingSeconds > BACKLOG_DEGRADED_SECONDS ? 'degraded' : 'ok', db: true, queue: stats }, 200);
});
