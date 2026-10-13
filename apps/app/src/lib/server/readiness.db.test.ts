import { Db } from '@ttg/db';
import { TestDb } from '@ttg/db/testing';
import { Effect, Layer, ManagedRuntime } from 'effect';
import { afterAll, describe, expect, it } from 'vitest';
import { readiness } from './readiness';

const rt = ManagedRuntime.make(TestDb);
afterAll(() => rt.dispose());
const check = async (layer?: Layer.Layer<Db>) => {
	const res = await (layer ? Effect.runPromise(readiness.pipe(Effect.provide(layer))) : rt.runPromise(readiness));
	return { status: res.status, body: (await res.json()) as any };
};

describe('GET /healthz/ready', () => {
	it('is degraded while the queue tables do not exist (the app has not started the queue)', async () => {
		expect(await check()).toEqual({ status: 200, body: { status: 'degraded', db: true, queue: null } });
	});

	it('is ok with an empty queue, degraded with an old waiting job, and counts recent failures without degrading', async () => {
		const q = (sql: string) => rt.runPromise(Effect.flatMap(Effect.service(Db), (db) => db.query(sql)));
		await q(`create schema pgboss`);
		await q(`create table pgboss.job (id serial primary key, name text, state text, start_after timestamptz not null default now(), completed_on timestamptz)`);
		expect((await check()).body).toEqual({ status: 'ok', db: true, queue: { waiting: 0, oldestWaitingSeconds: 0, failedLast24h: 0 } });

		await q(`insert into pgboss.job (name, state, start_after) values ('video.uploaded', 'created', now() - interval '2 minutes'), ('video.uploaded', 'created', now() + interval '1 hour')`);
		await q(`insert into pgboss.job (name, state, completed_on) values ('video.uploaded', 'failed', now() - interval '1 hour'), ('video.uploaded', 'failed', now() - interval '3 days')`);
		const recent = (await check()).body;
		expect(recent).toMatchObject({ status: 'ok', queue: { waiting: 1, failedLast24h: 1 } });
		expect(recent.queue.oldestWaitingSeconds).toBeGreaterThanOrEqual(120);

		await q(`insert into pgboss.job (name, state, start_after) values ('video.uploaded', 'retry', now() - interval '20 minutes')`);
		const stuck = await check();
		expect(stuck.status).toBe(200);
		expect(stuck.body).toMatchObject({ status: 'degraded', queue: { waiting: 2 } });
	});

	it('answers 503 when Postgres is unreachable', async () => {
		const broken = Layer.succeed(Db, { query: () => Effect.fail(new Error('connection refused')), maybeOne: () => Effect.fail(new Error('connection refused')), transaction: () => Effect.die('unused') } as never);
		expect(await check(broken)).toEqual({ status: 503, body: { status: 'down', db: false, queue: null } });
	});
});
