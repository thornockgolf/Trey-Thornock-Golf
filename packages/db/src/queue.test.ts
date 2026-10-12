import { Effect, ManagedRuntime } from 'effect';
import pg from 'pg';
import { PgBoss } from 'pg-boss';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Queue } from './queue';
import { createTempDatabase } from './test-db';

const V1 = '123e4567-e89b-42d3-a456-426614174001';
const V2 = '123e4567-e89b-42d3-a456-426614174002';
const V3 = '123e4567-e89b-42d3-a456-426614174003';

let db: Awaited<ReturnType<typeof createTempDatabase>>;
const sql = async <T extends pg.QueryResultRow>(text: string, params: unknown[] = []) => {
	const c = new pg.Client({ connectionString: db.url });
	await c.connect();
	try {
		return (await c.query<T>(text, params)).rows;
	} finally {
		await c.end();
	}
};
const until = async (check: () => Promise<boolean> | boolean, ms = 15_000) => {
	const start = Date.now();
	while (Date.now() - start < ms) {
		if (await check()) return;
		await new Promise((r) => setTimeout(r, 100));
	}
	throw new Error('timed out waiting for condition');
};

beforeAll(async () => {
	db = await createTempDatabase();
});
afterAll(async () => {
	await db?.drop();
});

describe('Queue (real pg-boss)', () => {
	it('creates the queues with the spec retry policy, and schedules the sweep once a worker consumes it', async () => {
		const rt = ManagedRuntime.make(Queue.layerFromUrl(db.url, { role: 'worker' }));
		await rt.runPromise(Queue.use(() => Effect.void)); // builds the layer
		try {
			const queues = await sql<{ name: string; policy: string; retry_limit: number; retry_backoff: boolean }>(
				`select name, policy, retry_limit, retry_backoff from pgboss.queue order by name`
			);
			const byName = Object.fromEntries(queues.map((q) => [q.name, q]));
			for (const n of ['video.uploaded', 'analysis.segment.uploaded', 'analysis.assemble', 'retention.sweep']) {
				expect(byName[n], n).toBeDefined();
			}
			expect(byName['video.uploaded']!.retry_limit).toBe(3);
			expect(byName['video.uploaded']!.retry_backoff).toBe(true);
			expect(byName['video.uploaded']!.policy).toBe('exclusive');
			expect(await sql(`select 1 from pgboss.schedule`)).toHaveLength(0);
			await rt.runPromise(Queue.use((q) => q.work('retention.sweep', () => Effect.void)));
			const schedules = await sql<{ name: string; cron: string }>(`select name, cron from pgboss.schedule`);
			expect(schedules).toEqual([{ name: 'retention.sweep', cron: '0 3 * * *' }]);
		} finally {
			await rt.dispose();
		}
	});

	it('queues a job, dedupes the same video, and a worker processes it', async () => {
		const producer = ManagedRuntime.make(Queue.layerFromUrl(db.url, { role: 'producer' }));
		const worker = ManagedRuntime.make(Queue.layerFromUrl(db.url, { role: 'worker' }));
		try {
			const id = await producer.runPromise(Queue.use((q) => q.send('video.uploaded', { video_id: V1 })));
			expect(id).toMatch(/^[0-9a-f-]{36}$/);
			const dup = await producer.runPromise(Queue.use((q) => q.send('video.uploaded', { video_id: V1 })));
			expect(dup).toBeUndefined();

			const seen: string[] = [];
			await worker.runPromise(
				Queue.use((q) =>
					q.work('video.uploaded', (job) =>
						Effect.sync(() => {
							seen.push(job.payload.video_id);
						})
					)
				)
			);
			await until(() => seen.length > 0);
			expect(seen).toEqual([V1]);
			await until(async () => (await sql<{ state: string }>(`select state from pgboss.job where id = $1`, [id!]))[0]?.state === 'completed');
		} finally {
			await producer.dispose();
			await worker.dispose();
		}
	});

	it('hands a failing job back to pg-boss for retry', async () => {
		const producer = ManagedRuntime.make(Queue.layerFromUrl(db.url, { role: 'producer' }));
		const worker = ManagedRuntime.make(Queue.layerFromUrl(db.url, { role: 'worker' }));
		try {
			const id = await producer.runPromise(Queue.use((q) => q.send('video.uploaded', { video_id: V2 })));
			let attempts = 0;
			await worker.runPromise(
				Queue.use((q) =>
					q.work('video.uploaded', (job) =>
						job.payload.video_id === V2
							? Effect.sync(() => void attempts++).pipe(Effect.andThen(Effect.fail('ffmpeg exploded')))
							: Effect.void
					)
				)
			);
			await until(() => attempts > 0);
			await until(async () => (await sql<{ state: string }>(`select state from pgboss.job where id = $1`, [id!]))[0]?.state === 'retry');
			// scheduled for a later attempt (exponential backoff from a 30 s delay), not retried immediately
			const [row] = await sql<{ retry_limit: number; delay_s: number }>(
				`select retry_limit, extract(epoch from (start_after - now()))::float as delay_s from pgboss.job where id = $1`,
				[id!]
			);
			expect(row!.retry_limit).toBe(3);
			expect(row!.delay_s).toBeGreaterThan(15);
			expect(attempts).toBe(1); // backoff delay means it is not retried immediately
		} finally {
			await producer.dispose();
			await worker.dispose();
		}
	});

	it('does not run the handler for a payload that fails validation', async () => {
		const raw = new PgBoss(db.url);
		raw.on('error', () => {});
		await raw.start();
		const worker = ManagedRuntime.make(Queue.layerFromUrl(db.url, { role: 'worker' }));
		try {
			const badId = await raw.send('analysis.assemble', { analysis_id: 'not-a-uuid' });
			let ran = false;
			await worker.runPromise(Queue.use((q) => q.work('analysis.assemble', () => Effect.sync(() => void (ran = true)))));
			await until(async () => {
				const [row] = await sql<{ state: string }>(`select state from pgboss.job where id = $1`, [badId!]);
				return row?.state === 'retry' || row?.state === 'failed';
			});
			expect(ran).toBe(false);
		} finally {
			await worker.dispose();
			await raw.stop({ graceful: false, wait: false } as never);
		}
	});

	it('rejects an invalid payload before sending', async () => {
		const producer = ManagedRuntime.make(Queue.layerFromUrl(db.url, { role: 'producer' }));
		try {
			await expect(
				producer.runPromise(Queue.use((q) => q.send('video.uploaded', { video_id: 'nope' } as never)))
			).rejects.toBeDefined();
			const [row] = await sql<{ n: string }>(`select count(*)::text as n from pgboss.job where data->>'video_id' = 'nope'`);
			expect(row?.n).toBe('0');
		} finally {
			await producer.dispose();
		}
	});

	it('processes a different video after a failure (V3)', async () => {
		const producer = ManagedRuntime.make(Queue.layerFromUrl(db.url, { role: 'producer' }));
		const worker = ManagedRuntime.make(Queue.layerFromUrl(db.url, { role: 'worker' }));
		try {
			await producer.runPromise(Queue.use((q) => q.send('video.uploaded', { video_id: V3 })));
			const done: string[] = [];
			await worker.runPromise(Queue.use((q) => q.work('video.uploaded', (j) => Effect.sync(() => void done.push(j.payload.video_id)))));
			await until(() => done.includes(V3));
		} finally {
			await producer.dispose();
			await worker.dispose();
		}
	});
});
