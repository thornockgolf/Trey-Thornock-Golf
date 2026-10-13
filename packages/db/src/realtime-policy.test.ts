import { assert, layer } from '@effect/vitest';
import { Effect } from 'effect';
import { Db } from './db';
import { TestDb } from './testing';

/**
 * The channel policy from migration 0010, run against stand-ins for what Supabase provides
 * (`realtime.messages`, `realtime.topic()`, `auth.jwt()`): a role may read a channel only when the
 * `topic` claim of its token is that channel.
 */
layer(TestDb, { timeout: 60_000 })('Realtime channel policy', (it) => {
	it.effect('lets a token read only the channel it names', () =>
		Effect.gen(function* () {
			const db = yield* Db;
			const sql = (text: string) => db.query(text);
			yield* sql(`create schema if not exists realtime`);
			yield* sql(`create table realtime.messages (id serial primary key, topic text, extension text)`);
			yield* sql(`alter table realtime.messages enable row level security`);
			yield* sql(`create function realtime.topic() returns text language sql stable as $$ select current_setting('realtime.topic', true) $$`);
			yield* sql(`create schema if not exists auth`);
			yield* sql(`create or replace function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$`);
			yield* sql(`grant usage on schema realtime, auth to authenticated, anon`);
			yield* sql(`grant select on realtime.messages to authenticated, anon`);
			yield* sql(`insert into realtime.messages (topic, extension) values ('conversation:1', 'broadcast')`);
			assert.strictEqual((yield* sql(`select app.install_realtime_policies()`)).length, 1);
			assert.strictEqual((yield* sql(`select 1 from pg_policies where schemaname = 'realtime' and policyname = 'ttg_channel_read'`)).length, 1);
			// installing again is fine
			yield* sql(`select app.install_realtime_policies()`);

			const readAs = (role: string, claims: string, channel: string) =>
				db.transaction((tx) =>
					Effect.gen(function* () {
						yield* tx.query(`set local role ${role}`);
						yield* tx.query(`select set_config('request.jwt.claims', $1, true), set_config('realtime.topic', $2, true)`, [claims, channel]);
						return (yield* tx.query(`select 1 from realtime.messages`)).length;
					})
				);
			assert.strictEqual(yield* readAs('authenticated', '{"topic":"conversation:1"}', 'conversation:1'), 1);
			assert.strictEqual(yield* readAs('authenticated', '{"topic":"conversation:1"}', 'conversation:2'), 0);
			assert.strictEqual(yield* readAs('authenticated', '{}', 'conversation:1'), 0);
			assert.strictEqual(yield* readAs('anon', '{"topic":"conversation:1"}', 'conversation:1'), 0);
		})
	);
});
