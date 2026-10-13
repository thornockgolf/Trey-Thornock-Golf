import { MAX_PUSH_SUBSCRIPTIONS_PER_USER, describeNotification, type PushPayload } from '@ttg/shared';
import { Context, Effect, Layer } from 'effect';
import webpush from 'web-push';
import { Db } from './db';
import type { DatabaseError } from './errors';
import type { Notification } from './notifications';

export interface PushSubscriptionRow {
	readonly id: string;
	readonly userId: string;
	readonly endpoint: string;
	readonly p256dh: string;
	readonly auth: string;
}

interface Row {
	id: string;
	user_id: string;
	endpoint: string;
	p256dh: string;
	auth: string;
}
const toRow = (r: Row): PushSubscriptionRow => ({ id: r.id, userId: r.user_id, endpoint: r.endpoint, p256dh: r.p256dh, auth: r.auth });

export class PushSubscriptions extends Context.Service<
	PushSubscriptions,
	{
		/**
		 * Save a browser's subscription for the user. The same endpoint saved again (even by another user, as on a shared
		 * browser) moves to this user. Keeps the newest `MAX_PUSH_SUBSCRIPTIONS_PER_USER`.
		 */
		readonly save: (input: { userId: string; endpoint: string; p256dh: string; auth: string }) => Effect.Effect<void, DatabaseError>;
		/** Remove the user's own subscription for this endpoint. Returns whether one was removed. */
		readonly remove: (userId: string, endpoint: string) => Effect.Effect<boolean, DatabaseError>;
		readonly listFor: (userId: string) => Effect.Effect<readonly PushSubscriptionRow[], DatabaseError>;
		/** The push service said the subscription is gone (404/410). */
		readonly removeGone: (endpoint: string) => Effect.Effect<void, DatabaseError>;
	}
>()('ttg/db/PushSubscriptions') {
	static readonly layer = Layer.effect(
		PushSubscriptions,
		Effect.gen(function* () {
			const db = yield* Db;
			return PushSubscriptions.of({
				save: ({ userId, endpoint, p256dh, auth }) =>
					db.transaction((tx) =>
						Effect.gen(function* () {
							yield* tx.query(
								`insert into push_subscriptions (user_id, endpoint, p256dh, auth) values ($1, $2, $3, $4)
								 on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth`,
								[userId, endpoint, p256dh, auth]
							);
							yield* tx.query(
								`delete from push_subscriptions where user_id = $1 and id not in
								   (select id from push_subscriptions where user_id = $1 order by updated_at desc, id limit $2)`,
								[userId, MAX_PUSH_SUBSCRIPTIONS_PER_USER]
							);
						})
					),
				remove: (userId, endpoint) =>
					db.query(`delete from push_subscriptions where user_id = $1 and endpoint = $2 returning id`, [userId, endpoint]).pipe(Effect.map((rows) => rows.length > 0)),
				listFor: (userId) =>
					db.query<Row>(`select id, user_id, endpoint, p256dh, auth from push_subscriptions where user_id = $1 order by created_at`, [userId]).pipe(Effect.map((rows) => rows.map(toRow))),
				removeGone: (endpoint) => db.query(`delete from push_subscriptions where endpoint = $1`, [endpoint]).pipe(Effect.asVoid)
			});
		})
	);
}

export interface WebPushConfig {
	/** VAPID public key, base64url (from `bunx web-push generate-vapid-keys`). */
	readonly publicKey: string;
	readonly privateKey: string;
	/** A `mailto:` or https URL the push services can contact. */
	readonly subject: string;
	/** Replaceable for tests; the real one is `web-push`. Rejects with `{ statusCode }` on an HTTP error. */
	readonly send?: (sub: { endpoint: string; keys: { p256dh: string; auth: string } }, body: string, options: { topic?: string; TTL: number }) => Promise<unknown>;
}

/** What goes to the device for a notification: the same words and link as the in-app bell. */
export const pushPayloadFor = (n: Notification): PushPayload => {
	const { title, href } = describeNotification({ type: n.type, payload: n.payload });
	const conversationId = typeof n.payload.conversationId === 'string' ? n.payload.conversationId : null;
	return { title, href, tag: conversationId ? `conversation-${conversationId}` : n.type };
};

/**
 * Browser push for notifications that are already stored in Postgres. Like Realtime it is a nudge and best effort:
 * `notify` never fails and does nothing when the keys are not configured. A subscription the push service reports
 * gone (404/410) is deleted.
 */
export class WebPush extends Context.Service<
	WebPush,
	{
		readonly enabled: boolean;
		readonly publicKey: string | null;
		readonly notify: (notifications: readonly Notification[]) => Effect.Effect<void>;
	}
>()('ttg/db/WebPush') {
	static readonly layerDisabled = Layer.succeed(WebPush, WebPush.of({ enabled: false, publicKey: null, notify: () => Effect.void }));

	/** From optional settings: any missing value means disabled. */
	static layerFromConfig = (config: Partial<WebPushConfig> | undefined): Layer.Layer<WebPush, never, PushSubscriptions> =>
		config?.publicKey && config.privateKey && config.subject ? WebPush.layerEnabled(config as WebPushConfig) : WebPush.layerDisabled;

	static layerEnabled = (config: WebPushConfig) =>
		Layer.effect(
			WebPush,
			Effect.gen(function* () {
				const subs = yield* PushSubscriptions;
				const send =
					config.send ??
					((sub, body, options) =>
						webpush.sendNotification(sub, body, { ...options, vapidDetails: { subject: config.subject, publicKey: config.publicKey, privateKey: config.privateKey } }));
				const toOne = (n: Notification) =>
					Effect.gen(function* () {
						const body = JSON.stringify(pushPayloadFor(n));
						const list = yield* subs.listFor(n.userId);
						yield* Effect.forEach(
							list,
							(s) =>
								Effect.tryPromise({
									try: () => send({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, { TTL: 60 * 60 * 24, topic: pushPayloadFor(n).tag.slice(0, 32).replace(/[^A-Za-z0-9_-]/g, '') || undefined }),
									catch: (e) => e as { statusCode?: number; message?: string }
								}).pipe(
									Effect.catch((e) =>
										e.statusCode === 404 || e.statusCode === 410
											? subs.removeGone(s.endpoint)
											: Effect.sync(() => console.warn(`Web push failed (${e.statusCode ?? 'network'}): ${e.message ?? 'unknown'}`))
									)
								),
							{ concurrency: 4, discard: true }
						);
					}).pipe(Effect.catchCause((cause) => Effect.sync(() => console.warn('Web push failed:', String(cause)))));
				return WebPush.of({
					enabled: true,
					publicKey: config.publicKey,
					notify: (ns) => Effect.forEach(ns, toOne, { concurrency: 2, discard: true })
				});
			})
		);
}
