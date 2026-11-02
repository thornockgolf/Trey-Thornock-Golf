import { emptyLogProblem, normalizeTags, type SessionTag } from '@ttg/shared';
import { Context, Effect, Layer } from 'effect';
import { Db } from './db';
import type { DatabaseError } from './errors';

/** A practice session a player logged that is not on their plan. Never counted in plan progress. */
export interface LoggedSession {
	readonly id: string;
	readonly playerId: string;
	/** `YYYY-MM-DD`, the player's local day. */
	readonly loggedOn: string;
	readonly tags: readonly SessionTag[];
	readonly minutes: number | null;
	readonly workedOn: string | null;
	readonly drills: readonly { readonly id: string; readonly name: string }[];
	readonly notes: string | null;
	readonly video: { readonly id: string; readonly status: 'pending' | 'uploaded' | 'processing' | 'ready' | 'failed'; readonly title: string | null } | null;
	readonly createdAt: Date;
}

interface Row {
	id: string;
	player_id: string;
	logged_on: string;
	tags: unknown[];
	minutes: number | null;
	worked_on: string | null;
	drills: { id: string; name: string }[];
	notes: string | null;
	video_id: string | null;
	video_status: 'pending' | 'uploaded' | 'processing' | 'ready' | 'failed' | null;
	video_title: string | null;
	created_at: Date;
}

const SELECT = `l.id, l.player_id, l.logged_on::text as logged_on, l.tags, l.minutes, l.worked_on, l.drills, l.notes, l.video_id,
	v.status as video_status, v.title as video_title, l.created_at
	from logged_sessions l left join videos v on v.id = l.video_id`;

const toLogged = (r: Row): LoggedSession => ({
	id: r.id,
	playerId: r.player_id,
	loggedOn: r.logged_on,
	tags: normalizeTags(r.tags),
	minutes: r.minutes,
	workedOn: r.worked_on,
	drills: r.drills,
	notes: r.notes,
	video: r.video_id && r.video_status ? { id: r.video_id, status: r.video_status, title: r.video_title } : null,
	createdAt: r.created_at
});

/** Fields of a log as written; `null` means "none". */
export interface LoggedFields {
	readonly loggedOn: string;
	readonly tags: readonly SessionTag[];
	readonly minutes: number | null;
	readonly workedOn: string | null;
	readonly drillIds: readonly string[];
	readonly notes: string | null;
	readonly videoId: string | null;
}

export type LoggedWrite =
	| { readonly _tag: 'Saved'; readonly session: LoggedSession }
	| { readonly _tag: 'Missing' }
	| { readonly _tag: 'UnknownDrill' }
	| { readonly _tag: 'Empty'; readonly message: string };

export class LoggedSessions extends Context.Service<
	LoggedSessions,
	{
		/** Newest day first (then newest logged first). */
		readonly listForPlayer: (playerId: string, limit?: number) => Effect.Effect<readonly LoggedSession[], DatabaseError>;
		readonly get: (id: string) => Effect.Effect<LoggedSession | undefined, DatabaseError>;
		/** Drill ids are looked up for their names (a snapshot); an unknown one is `UnknownDrill`. An empty log is `Empty`. */
		readonly create: (input: { playerId: string } & LoggedFields) => Effect.Effect<LoggedWrite, DatabaseError>;
		/** Only the player's own log (anyone else's is `Missing`). `patch` keys that are absent stay as they are. */
		readonly update: (input: { id: string; playerId: string; patch: Partial<LoggedFields> }) => Effect.Effect<LoggedWrite, DatabaseError>;
		/** True when the player's own log existed and is gone. The linked video stays in their library. */
		readonly remove: (input: { id: string; playerId: string }) => Effect.Effect<boolean, DatabaseError>;
	}
>()('ttg/db/LoggedSessions') {
	static readonly layer = Layer.effect(
		LoggedSessions,
		Effect.gen(function* () {
			const db = yield* Db;

			const drillSnapshot = (tx: Pick<typeof db, 'query'>, ids: readonly string[]) =>
				Effect.gen(function* () {
					const unique = [...new Set(ids)];
					if (unique.length === 0) return [] as { id: string; name: string }[];
					const rows = yield* tx.query<{ id: string; name: string }>(`select id, name from drills where id = any($1::uuid[])`, [unique]);
					const byId = new Map(rows.map((d) => [d.id, d.name]));
					if (unique.some((id) => !byId.has(id))) return undefined;
					return unique.map((id) => ({ id, name: byId.get(id)! }));
				});

			return LoggedSessions.of({
				listForPlayer: (playerId, limit = 200) =>
					db
						.query<Row>(`select ${SELECT} where l.player_id = $1 order by l.logged_on desc, l.created_at desc limit $2`, [playerId, limit])
						.pipe(Effect.map((rows) => rows.map(toLogged))),
				get: (id) => db.maybeOne<Row>(`select ${SELECT} where l.id = $1`, [id]).pipe(Effect.map((r) => (r ? toLogged(r) : undefined))),
				create: (i) =>
					db.transaction((tx) =>
						Effect.gen(function* () {
							const empty = emptyLogProblem({ tags: i.tags, workedOn: i.workedOn, notes: i.notes, drillIds: i.drillIds });
							if (empty) return { _tag: 'Empty', message: empty } as const;
							const drills = yield* drillSnapshot(tx, i.drillIds);
							if (!drills) return { _tag: 'UnknownDrill' } as const;
							const row = (yield* tx.maybeOne<{ id: string }>(
								`insert into logged_sessions (player_id, logged_on, tags, minutes, worked_on, drills, notes, video_id)
								 values ($1, $2::date, $3::jsonb, $4, $5, $6::jsonb, $7, $8) returning id`,
								[i.playerId, i.loggedOn, JSON.stringify(normalizeTags(i.tags)), i.minutes, i.workedOn, JSON.stringify(drills), i.notes, i.videoId]
							))!;
							const saved = (yield* tx.maybeOne<Row>(`select ${SELECT} where l.id = $1`, [row.id]))!;
							return { _tag: 'Saved', session: toLogged(saved) } as const;
						})
					),
				update: (i) =>
					db.transaction((tx) =>
						Effect.gen(function* () {
							const before = yield* tx.maybeOne<Row>(`select ${SELECT} where l.id = $1 and l.player_id = $2 for update of l`, [i.id, i.playerId]);
							if (!before) return { _tag: 'Missing' } as const;
							const cur = toLogged(before);
							const p = i.patch;
							const merged: LoggedFields = {
								loggedOn: p.loggedOn ?? cur.loggedOn,
								tags: p.tags ?? cur.tags,
								minutes: p.minutes === undefined ? cur.minutes : p.minutes,
								workedOn: p.workedOn === undefined ? cur.workedOn : p.workedOn,
								drillIds: p.drillIds ?? cur.drills.map((d) => d.id),
								notes: p.notes === undefined ? cur.notes : p.notes,
								videoId: p.videoId === undefined ? (cur.video?.id ?? null) : p.videoId
							};
							const empty = emptyLogProblem(merged);
							if (empty) return { _tag: 'Empty', message: empty } as const;
							// Keep the stored name snapshot for drills that were already there; look up only new ones.
							const known = new Map(cur.drills.map((d) => [d.id, d.name]));
							const fresh = merged.drillIds.filter((id) => !known.has(id));
							const looked = yield* drillSnapshot(tx, fresh);
							if (!looked) return { _tag: 'UnknownDrill' } as const;
							for (const d of looked) known.set(d.id, d.name);
							const drills = [...new Set(merged.drillIds)].map((id) => ({ id, name: known.get(id)! }));
							yield* tx.query(
								`update logged_sessions set logged_on = $2::date, tags = $3::jsonb, minutes = $4, worked_on = $5, drills = $6::jsonb, notes = $7, video_id = $8
								 where id = $1`,
								[i.id, merged.loggedOn, JSON.stringify(normalizeTags(merged.tags)), merged.minutes, merged.workedOn, JSON.stringify(drills), merged.notes, merged.videoId]
							);
							const saved = (yield* tx.maybeOne<Row>(`select ${SELECT} where l.id = $1`, [i.id]))!;
							return { _tag: 'Saved', session: toLogged(saved) } as const;
						})
					),
				remove: (i) =>
					db
						.query(`delete from logged_sessions where id = $1 and player_id = $2 returning id`, [i.id, i.playerId])
						.pipe(Effect.map((rows) => rows.length > 0))
			});
		})
	);
}
