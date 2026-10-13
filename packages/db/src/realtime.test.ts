import { createServer } from 'node:http';
import { assert, describe, it } from '@effect/vitest';
import { Effect } from 'effect';
import { Realtime, REALTIME_TOKEN_TTL_SECONDS, signJwt } from './realtime';
import { createHmac } from 'node:crypto';

const decode = (jwt: string) => JSON.parse(Buffer.from(jwt.split('.')[1]!, 'base64url').toString());

describe('Realtime', () => {
	it.effect('mints a token scoped to one topic that expires within 5 minutes and verifies with the secret', () =>
		Effect.gen(function* () {
			const rt = yield* Effect.provide(Effect.service(Realtime), Realtime.layerEnabled({ url: 'http://x', serviceRoleKey: 's', jwtSecret: 'secret', anonKey: 'a' }));
			const now = new Date('2026-10-13T10:00:00Z');
			const t = (yield* rt.mintToken({ userId: 'u1', topic: 'conversation:abc', now }))!;
			const claims = decode(t.token);
			assert.deepStrictEqual([claims.role, claims.aud, claims.sub, claims.topic], ['authenticated', 'authenticated', 'u1', 'conversation:abc']);
			assert.isAtMost(claims.exp - claims.iat, 300);
			assert.strictEqual(REALTIME_TOKEN_TTL_SECONDS, 300);
			assert.strictEqual(t.expiresAt.getTime(), claims.exp * 1000);
			const [h, b, sig] = t.token.split('.');
			assert.strictEqual(sig, createHmac('sha256', 'secret').update(`${h}.${b}`).digest('base64url'));
			assert.notStrictEqual(signJwt({ a: 1 }, 'other'), signJwt({ a: 1 }, 'secret'));
		})
	);

	it.effect('is disabled without full configuration: no token, publish is a no-op', () =>
		Effect.gen(function* () {
			const rt = yield* Effect.provide(Effect.service(Realtime), Realtime.layerFromConfig({ url: 'http://x' }));
			assert.isFalse(rt.enabled);
			assert.isNull(rt.clientConfig);
			assert.isUndefined(yield* rt.mintToken({ userId: 'u', topic: 't' }));
			yield* rt.publish('t', 'e', {});
		})
	);

	it.effect('publishes a private broadcast with the service key, and swallows failures', () =>
		Effect.gen(function* () {
			const seen: { url: string; headers: Record<string, unknown>; body: any }[] = [];
			let status = 202;
			const server = createServer((req, res) => {
				let data = '';
				req.on('data', (c) => (data += c));
				req.on('end', () => {
					seen.push({ url: req.url!, headers: req.headers, body: JSON.parse(data) });
					res.statusCode = status;
					res.end();
				});
			});
			yield* Effect.promise(() => new Promise<void>((r) => server.listen(0, '127.0.0.1', r)));
			const port = (server.address() as { port: number }).port;
			const rt = yield* Effect.provide(Effect.service(Realtime), Realtime.layerEnabled({ url: `http://127.0.0.1:${port}/`, serviceRoleKey: 'svc', jwtSecret: 's', anonKey: 'a' }));
			yield* rt.publish('conversation:1', 'message.created', { id: 'm' });
			assert.strictEqual(seen[0]!.url, '/realtime/v1/api/broadcast');
			assert.strictEqual(seen[0]!.headers.apikey, 'svc');
			assert.strictEqual(seen[0]!.headers.authorization, 'Bearer svc');
			assert.deepStrictEqual(seen[0]!.body, { messages: [{ topic: 'conversation:1', event: 'message.created', payload: { id: 'm' }, private: true }] });
			status = 500;
			yield* rt.publish('conversation:1', 'message.created', {}); // must not throw
			yield* Effect.promise(() => new Promise((r) => server.close(r)));
			yield* rt.publish('conversation:1', 'message.created', {}); // connection refused: still fine
		})
	);
});
