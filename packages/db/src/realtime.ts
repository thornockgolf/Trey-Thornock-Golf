import { createHmac } from 'node:crypto';
import { Context, Effect, Layer } from 'effect';

/** Short-lived on purpose: the browser asks again before this runs out (spec 3.E.1: 5 minutes at most). */
export const REALTIME_TOKEN_TTL_SECONDS = 300;

const b64url = (input: string | Buffer) => Buffer.from(input).toString('base64url');

/** An HS256 JWT, the format self-hosted Supabase verifies with its JWT secret. */
export const signJwt = (claims: Record<string, unknown>, secret: string) => {
	const head = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
	const body = b64url(JSON.stringify(claims));
	return `${head}.${body}.${createHmac('sha256', secret).update(`${head}.${body}`).digest('base64url')}`;
};

export interface RealtimeConfig {
	/** Base URL of the Supabase API gateway, e.g. https://supabase.example.com (no trailing slash needed). */
	readonly url: string;
	readonly serviceRoleKey: string;
	readonly jwtSecret: string;
	/** Public, handed to browsers so they can open the socket. */
	readonly anonKey: string;
	readonly fetch?: typeof fetch;
}

export interface RealtimeToken {
	readonly token: string;
	readonly expiresAt: Date;
}

/**
 * Supabase Realtime from the server side. Writes go to Postgres first; this only tells subscribers
 * that something changed, so a failure here is logged and never fails the request (clients also
 * poll and catch up by cursor).
 *
 * Channels are private Broadcast channels (`conversation:{id}`, `user:{id}`). Browsers get a token
 * from `mintToken` whose `topic` claim names the one channel they may receive on; the policy in
 * migration 0010 compares it to the channel being joined.
 */
export class Realtime extends Context.Service<
	Realtime,
	{
		readonly enabled: boolean;
		/** What a browser needs to connect, or null when Realtime is not configured. */
		readonly clientConfig: { readonly url: string; readonly anonKey: string } | null;
		/** Best effort; never fails. */
		readonly publish: (topic: string, event: string, payload: unknown) => Effect.Effect<void>;
		/** A token for one channel; undefined when Realtime is not configured. */
		readonly mintToken: (input: { userId: string; topic: string; now?: Date }) => Effect.Effect<RealtimeToken | undefined>;
	}
>()('ttg/db/Realtime') {
	static readonly layerDisabled = Layer.succeed(
		Realtime,
		Realtime.of({ enabled: false, clientConfig: null, publish: () => Effect.void, mintToken: () => Effect.succeed(undefined) })
	);

	/** From optional settings: missing values mean disabled (the app still works, by polling). */
	static layerFromConfig = (config: Partial<RealtimeConfig> | undefined) =>
		config?.url && config.serviceRoleKey && config.jwtSecret && config.anonKey ? Realtime.layerEnabled(config as RealtimeConfig) : Realtime.layerDisabled;

	static layerEnabled = (config: RealtimeConfig) => {
		const base = config.url.replace(/\/+$/, '');
		const doFetch = config.fetch ?? fetch;
		let lastWarn = 0;
		const warn = (message: string) => {
			// One line a minute, not one per message.
			if (Date.now() - lastWarn > 60_000) {
				lastWarn = Date.now();
				console.warn(`Realtime publish failed: ${message}`);
			}
		};
		return Layer.succeed(
			Realtime,
			Realtime.of({
				enabled: true,
				clientConfig: { url: base, anonKey: config.anonKey },
				publish: (topic, event, payload) =>
					Effect.tryPromise({
						try: async () => {
							const res = await doFetch(`${base}/realtime/v1/api/broadcast`, {
								method: 'POST',
								headers: { 'content-type': 'application/json', apikey: config.serviceRoleKey, authorization: `Bearer ${config.serviceRoleKey}` },
								body: JSON.stringify({ messages: [{ topic, event, payload, private: true }] }),
								signal: AbortSignal.timeout(3000)
							});
							if (!res.ok) throw new Error(`HTTP ${res.status}`);
						},
						catch: (e) => e
					}).pipe(Effect.catch((e) => Effect.sync(() => warn(e instanceof Error ? e.message : String(e))))),
				mintToken: ({ userId, topic, now = new Date() }) =>
					Effect.sync(() => {
						const iat = Math.floor(now.getTime() / 1000);
						const exp = iat + REALTIME_TOKEN_TTL_SECONDS;
						const token = signJwt({ aud: 'authenticated', role: 'authenticated', sub: userId, topic, iat, exp }, config.jwtSecret);
						return { token, expiresAt: new Date(exp * 1000) };
					})
			})
		);
	};
}
