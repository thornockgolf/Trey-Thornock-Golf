/** TEMPORARY dev tool: feedback tickets. Remove with the steps in docs/system/feedback.md. */
import type { CreateFeedbackRequest, FeedbackDto, FeedbackPriority, FeedbackStatus, FeedbackType } from '@ttg/shared';
import { Context, Effect, Layer } from 'effect';
import { Db } from './db';
import type { DatabaseError } from './errors';

interface Row {
	id: string;
	author_id: string;
	author_name: string | null;
	author_role: 'player' | 'coach';
	title: string;
	body: string;
	type: FeedbackType;
	priority: FeedbackPriority;
	status: FeedbackStatus;
	page_path: string;
	viewport: string;
	user_agent: string;
	resolution_notes: string | null;
	created_at: Date;
	updated_at: Date;
}

const SELECT = `select t.id, t.author_id, u.display_name as author_name, t.author_role, t.title, t.body, t.type, t.priority, t.status,
	t.page_path, t.viewport, t.user_agent, t.resolution_notes, t.created_at, t.updated_at
	from feedback_tickets t join users u on u.id = t.author_id`;

const toDto = (r: Row): FeedbackDto => ({
	id: r.id,
	authorId: r.author_id,
	authorName: r.author_name,
	authorRole: r.author_role,
	title: r.title,
	body: r.body,
	type: r.type,
	priority: r.priority,
	status: r.status,
	pagePath: r.page_path,
	viewport: r.viewport,
	userAgent: r.user_agent,
	resolutionNotes: r.resolution_notes,
	createdAt: r.created_at.toISOString(),
	updatedAt: r.updated_at.toISOString()
});

export interface FeedbackPatch {
	readonly title?: string;
	readonly body?: string;
	readonly type?: FeedbackType;
	readonly priority?: FeedbackPriority;
	readonly status?: FeedbackStatus;
	readonly resolutionNotes?: string | null;
}

export class Feedback extends Context.Service<
	Feedback,
	{
		readonly create: (input: { authorId: string; authorRole: 'player' | 'coach' } & CreateFeedbackRequest) => Effect.Effect<FeedbackDto, DatabaseError>;
		/** Newest first. `authorId` limits to one person's tickets (players); omit it for everyone's (coaches). */
		readonly list: (filter: { authorId?: string; status?: FeedbackStatus; type?: FeedbackType }) => Effect.Effect<readonly FeedbackDto[], DatabaseError>;
		readonly get: (id: string) => Effect.Effect<FeedbackDto | undefined, DatabaseError>;
		/** Apply only the fields given. Undefined when the ticket does not exist. Who may change what is the caller's rule. */
		readonly update: (id: string, patch: FeedbackPatch) => Effect.Effect<FeedbackDto | undefined, DatabaseError>;
		/** Oldest first, for the Markdown export (the formatter in `@ttg/shared` orders by priority). */
		readonly listForExport: (status: FeedbackStatus | 'all') => Effect.Effect<readonly FeedbackDto[], DatabaseError>;
	}
>()('ttg/db/Feedback') {
	static readonly layer = Layer.effect(
		Feedback,
		Effect.gen(function* () {
			const db = yield* Db;
			const get = (id: string) => db.maybeOne<Row>(`${SELECT} where t.id = $1`, [id]).pipe(Effect.map((r) => (r ? toDto(r) : undefined)));
			return Feedback.of({
				create: (i) =>
					db
						.maybeOne<{ id: string }>(
							`insert into feedback_tickets (author_id, author_role, title, body, type, priority, page_path, viewport, user_agent)
							 values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning id`,
							[i.authorId, i.authorRole, i.title.trim(), i.body.trim(), i.type, i.priority ?? 'normal', i.pagePath ?? '', i.viewport ?? '', i.userAgent ?? '']
						)
						.pipe(Effect.flatMap((r) => get(r!.id)), Effect.map((t) => t!)),
				list: (f) =>
					db
						.query<Row>(
							`${SELECT} where ($1::uuid is null or t.author_id = $1) and ($2::text is null or t.status = $2) and ($3::text is null or t.type = $3)
							 order by t.created_at desc`,
							[f.authorId ?? null, f.status ?? null, f.type ?? null]
						)
						.pipe(Effect.map((rows) => rows.map(toDto))),
				get,
				update: (id, p) =>
					db
						.maybeOne<{ id: string }>(
							`update feedback_tickets set
								title = coalesce($2, title), body = coalesce($3, body), type = coalesce($4, type), priority = coalesce($5, priority),
								status = coalesce($6, status),
								resolution_notes = case when $7::boolean then $8 else resolution_notes end
							 where id = $1 returning id`,
							[id, p.title?.trim() ?? null, p.body?.trim() ?? null, p.type ?? null, p.priority ?? null, p.status ?? null, p.resolutionNotes !== undefined, p.resolutionNotes?.trim() || null]
						)
						.pipe(Effect.flatMap((r) => (r ? get(r.id) : Effect.succeed(undefined)))),
				listForExport: (status) =>
					db
						.query<Row>(`${SELECT} where ($1::text = 'all' or t.status = $1) order by t.created_at asc`, [status])
						.pipe(Effect.map((rows) => rows.map(toDto)))
			});
		})
	);
}
