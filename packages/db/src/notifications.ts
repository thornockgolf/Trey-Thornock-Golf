import { Context, Effect, Layer } from 'effect';
import { Db, type Queryer } from './db';
import type { DatabaseError } from './errors';

export interface Notification {
	readonly id: string;
	readonly userId: string;
	readonly type: string;
	readonly payload: Readonly<Record<string, unknown>>;
	readonly readAt: Date | null;
	readonly createdAt: Date;
}

interface Row {
	id: string;
	user_id: string;
	type: string;
	payload: Record<string, unknown>;
	read_at: Date | null;
	created_at: Date;
}

const COLUMNS = 'id, user_id, type, payload, read_at, created_at';
const toNotification = (r: Row): Notification => ({ id: r.id, userId: r.user_id, type: r.type, payload: r.payload, readAt: r.read_at, createdAt: r.created_at });

/** Write a notification inside any transaction. Services that notify as part of their own writes use this. */
export const insertNotification = (q: Queryer, userId: string, type: string, payload: Record<string, unknown> = {}) =>
	q
		.maybeOne<Row>(`insert into notifications (user_id, type, payload) values ($1, $2, $3::jsonb) returning ${COLUMNS}`, [userId, type, JSON.stringify(payload)])
		.pipe(Effect.map((r) => toNotification(r!)));

export class Notifications extends Context.Service<
	Notifications,
	{
		/** Newest first. */
		readonly list: (userId: string, limit?: number) => Effect.Effect<readonly Notification[], DatabaseError>;
		readonly unreadCount: (userId: string) => Effect.Effect<number, DatabaseError>;
		readonly create: (userId: string, type: string, payload?: Record<string, unknown>) => Effect.Effect<Notification, DatabaseError>;
		/** Mark the user's own notifications read (ids that are not theirs are ignored). Returns how many changed. */
		readonly markRead: (userId: string, ids: readonly string[]) => Effect.Effect<number, DatabaseError>;
		readonly markAllRead: (userId: string) => Effect.Effect<number, DatabaseError>;
	}
>()('ttg/db/Notifications') {
	static readonly layer = Layer.effect(
		Notifications,
		Effect.gen(function* () {
			const db = yield* Db;
			return Notifications.of({
				list: (userId, limit = 50) =>
					db
						.query<Row>(`select ${COLUMNS} from notifications where user_id = $1 order by created_at desc, id limit $2`, [userId, limit])
						.pipe(Effect.map((rows) => rows.map(toNotification))),
				unreadCount: (userId) =>
					db.maybeOne<{ n: string }>(`select count(*) as n from notifications where user_id = $1 and read_at is null`, [userId]).pipe(Effect.map((r) => Number(r?.n ?? 0))),
				create: (userId, type, payload = {}) => insertNotification(db, userId, type, payload),
				markRead: (userId, ids) =>
					db
						.query(`update notifications set read_at = now() where user_id = $1 and id = any($2::uuid[]) and read_at is null returning id`, [userId, ids])
						.pipe(Effect.map((rows) => rows.length)),
				markAllRead: (userId) =>
					db.query(`update notifications set read_at = now() where user_id = $1 and read_at is null returning id`, [userId]).pipe(Effect.map((rows) => rows.length))
			});
		})
	);
}
