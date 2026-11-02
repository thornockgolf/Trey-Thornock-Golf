/** TEMPORARY dev tool (docs/system/feedback.md): feedback ticket handlers. Authorization is here, not in Postgres. */
import { Feedback } from '@ttg/db';
import {
	CreateFeedbackRequest,
	FEEDBACK_STATUSES,
	FEEDBACK_TYPES,
	UpdateFeedbackRequest,
	formatFeedbackMarkdown,
	parseExportStatus,
	type FeedbackStatus,
	type FeedbackType
} from '@ttg/shared';
import { Effect } from 'effect';
import { currentUser, requireRole } from './auth';
import { decodeBody } from './decode';
import { Conflict, Forbidden, NotFound } from './errors';
import { RequestContext } from './request-context';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const idParam = Effect.gen(function* () {
	const { event } = yield* RequestContext;
	const id = event.params.id ?? '';
	if (!UUID.test(id)) return yield* new NotFound({ message: 'Ticket not found' });
	return id;
});

const oneOf = <T extends string>(allowed: readonly T[], raw: string | null) => (allowed.includes(raw as T) ? (raw as T) : undefined);

/** `POST /api/feedback`: any signed-in user files a ticket. Their role comes from the session. */
export const createFeedback = Effect.gen(function* () {
	const user = yield* currentUser;
	const body = yield* decodeBody(CreateFeedbackRequest);
	return yield* (yield* Feedback).create({ authorId: user.id, authorRole: user.role, ...body });
});

/** `GET /api/feedback?status=&type=`: a coach sees every ticket, anyone else only their own. */
export const listFeedback = Effect.gen(function* () {
	const user = yield* currentUser;
	const { event } = yield* RequestContext;
	const q = event.url.searchParams;
	const tickets = yield* (yield* Feedback).list({
		...(user.role === 'coach' ? {} : { authorId: user.id }),
		status: oneOf<FeedbackStatus>(FEEDBACK_STATUSES, q.get('status')),
		type: oneOf<FeedbackType>(FEEDBACK_TYPES, q.get('type'))
	});
	return { tickets };
});

/** A ticket the user may see: a coach any, anyone else their own. Someone else's is a 404, so it leaks nothing. */
const visibleTicket = (id: string, user: { id: string; role: string }) =>
	Effect.gen(function* () {
		const ticket = yield* (yield* Feedback).get(id);
		if (!ticket || (user.role !== 'coach' && ticket.authorId !== user.id)) return yield* new NotFound({ message: 'Ticket not found' });
		return ticket;
	});

/** `GET /api/feedback/:id` */
export const getFeedback = Effect.gen(function* () {
	const user = yield* currentUser;
	return yield* visibleTicket(yield* idParam, user);
});

/**
 * `PATCH /api/feedback/:id`. The author edits title, body, type and priority while the ticket is open (409 after).
 * A coach sets `status` (any value) and `resolutionNotes` on any ticket. A player may only toggle their own ticket
 * between `open` and `done` (Mark done / Reopen): any other status value or `resolutionNotes` is 403, and a ticket
 * the coach has moved to in progress or won't do is 409 for them.
 */
export const updateFeedback = Effect.gen(function* () {
	const user = yield* currentUser;
	const id = yield* idParam;
	const patch = yield* decodeBody(UpdateFeedbackRequest);
	const ticket = yield* visibleTicket(id, user);
	const touchesContent = patch.title !== undefined || patch.body !== undefined || patch.type !== undefined || patch.priority !== undefined;
	if (user.role !== 'coach') {
		if (patch.resolutionNotes !== undefined) return yield* new Forbidden({ message: 'Only the coach can change notes' });
		if (patch.status !== undefined) {
			if (patch.status !== 'open' && patch.status !== 'done') return yield* new Forbidden({ message: 'Only the coach can set that status' });
			if (ticket.status !== 'open' && ticket.status !== 'done') return yield* new Conflict({ message: 'The coach is handling this ticket, so its status cannot be changed here' });
		}
	}
	if (touchesContent) {
		if (ticket.authorId !== user.id) return yield* new Forbidden({ message: 'Only the author can edit this ticket' });
		if (ticket.status !== 'open') return yield* new Conflict({ message: 'This ticket is no longer open, so it cannot be edited' });
	}
	return (yield* (yield* Feedback).update(id, patch)) ?? (yield* new NotFound({ message: 'Ticket not found' }));
});

/** `DELETE /api/feedback/:id`: the author deletes their own ticket, a coach any ticket. Permanent. Someone else's is 404. */
export const deleteFeedback = Effect.gen(function* () {
	const user = yield* currentUser;
	const id = yield* idParam;
	yield* visibleTicket(id, user);
	if (!(yield* (yield* Feedback).remove(id))) return yield* new NotFound({ message: 'Ticket not found' });
	return { ok: true as const };
});

/** `GET /api/feedback/export?status=open|in_progress|done|wont_do|all`: Markdown for a coding agent. Coach only. */
export const exportFeedback = Effect.gen(function* () {
	yield* requireRole('coach');
	const { event } = yield* RequestContext;
	const status = parseExportStatus(event.url.searchParams.get('status'));
	const tickets = yield* (yield* Feedback).listForExport(status);
	return new Response(formatFeedbackMarkdown(tickets, { status, generatedAt: new Date() }), {
		headers: { 'content-type': 'text/markdown; charset=utf-8', 'cache-control': 'no-store' }
	});
});
