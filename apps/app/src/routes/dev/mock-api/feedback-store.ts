/**
 * Dev-only in-memory stand-in for the feedback API (TEMPORARY dev tool, docs/system/feedback.md). Paths look like
 * `as-coach/feedback` or `as-player/feedback/:id`, so a preview can act as either role. It follows the real rules:
 * players see their own, only coaches set status and notes, edits stop once a ticket is not open.
 */
import { dev } from '$app/env';
import { error, json } from '@sveltejs/kit';
import {
	CreateFeedbackRequest,
	UpdateFeedbackRequest,
	formatFeedbackMarkdown,
	parseExportStatus,
	type FeedbackDto
} from '@ttg/shared';
import { Schema } from 'effect';

export const MOCK_COACH_ID = '00000000-0000-4000-8000-00000000c0ac';
export const MOCK_PLAYER_ID = '00000000-0000-4000-8000-00000000b001';
const fail = (status: number, code: string, message: string) => json({ code, message }, { status });
const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();

const tickets: FeedbackDto[] = [];
const seed = (over: Partial<FeedbackDto> & Pick<FeedbackDto, 'title' | 'body' | 'type'>, minutes: number) =>
	tickets.push({
		id: crypto.randomUUID(),
		authorId: MOCK_PLAYER_ID,
		authorName: 'Sam Player',
		authorRole: 'player',
		priority: 'normal',
		status: 'open',
		pagePath: '/plans',
		viewport: '390x844',
		userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)',
		resolutionNotes: null,
		createdAt: ago(minutes),
		updatedAt: ago(minutes),
		...over
	});
seed({ title: 'Make the Start Lesson button bigger', body: 'On my phone the button on the Home card is hard to hit with my thumb.\nCan it be full width?', type: 'change', priority: 'high', pagePath: '/' }, 90);
seed({ title: 'Video freezes on rewind', body: 'Dragging the scrubber back quickly freezes the picture until I tap play.', type: 'bug', pagePath: '/videos/abc?t=12' }, 60 * 5);
seed(
	{ title: 'Show the roadmap on the plan page', body: 'Would be nice to see the phases next to the sessions list.', type: 'idea', authorId: MOCK_COACH_ID, authorName: 'Trey Thornock', authorRole: 'coach', pagePath: '/coach/plans', viewport: '1280x800', userAgent: 'Mozilla/5.0 (X11; Linux x86_64) Chrome/130' },
	60 * 30
);
seed({ title: 'Chat send button too close to the edge', body: 'Hard to hit on a small phone.', type: 'bug', status: 'done', resolutionNotes: 'Added padding in ChatThread.', pagePath: '/messages' }, 60 * 50);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export const feedbackHandle = (method: string, rest: string, body: unknown, url: URL): Response | undefined => {
	const m = /^as-(coach|player)\/feedback(?:\/([^/]+))?$/.exec(rest);
	if (!m) return undefined;
	if (!dev) error(404, 'Not found');
	const role = m[1] as 'coach' | 'player';
	const me = role === 'coach' ? MOCK_COACH_ID : MOCK_PLAYER_ID;
	const sub = m[2];

	if (sub === 'export' && method === 'GET') {
		if (role !== 'coach') return fail(403, 'Forbidden', 'Not allowed');
		const status = parseExportStatus(url.searchParams.get('status'));
		const rows = tickets.filter((t) => status === 'all' || t.status === status);
		return new Response(formatFeedbackMarkdown(rows, { status, generatedAt: new Date() }), { headers: { 'content-type': 'text/markdown; charset=utf-8' } });
	}
	if (!sub && method === 'GET') {
		const status = url.searchParams.get('status');
		const type = url.searchParams.get('type');
		const rows = tickets
			.filter((t) => role === 'coach' || t.authorId === me)
			.filter((t) => !status || t.status === status)
			.filter((t) => !type || t.type === type)
			.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
		return json({ tickets: rows });
	}
	if (!sub && method === 'POST') {
		const d = Schema.decodeUnknownExit(CreateFeedbackRequest)(body);
		if (d._tag !== 'Success') return fail(422, 'ValidationError', 'Invalid request body');
		const now = new Date().toISOString();
		const t: FeedbackDto = {
			id: crypto.randomUUID(),
			authorId: me,
			authorName: role === 'coach' ? 'Trey Thornock' : 'Sam Player',
			authorRole: role,
			title: d.value.title.trim(),
			body: d.value.body.trim(),
			type: d.value.type,
			priority: d.value.priority ?? 'normal',
			status: 'open',
			pagePath: d.value.pagePath ?? '',
			viewport: d.value.viewport ?? '',
			userAgent: d.value.userAgent ?? '',
			resolutionNotes: null,
			createdAt: now,
			updatedAt: now
		};
		tickets.push(t);
		return json(t);
	}
	const t = sub && UUID.test(sub) ? tickets.find((x) => x.id === sub) : undefined;
	if (!t || (role !== 'coach' && t.authorId !== me)) return fail(404, 'NotFound', 'Ticket not found');
	if (method === 'GET') return json(t);
	if (method === 'PATCH') {
		const d = Schema.decodeUnknownExit(UpdateFeedbackRequest)(body);
		if (d._tag !== 'Success') return fail(422, 'ValidationError', 'Invalid request body');
		const p = d.value;
		if ((p.status !== undefined || p.resolutionNotes !== undefined) && role !== 'coach') return fail(403, 'Forbidden', 'Only the coach can change status or notes');
		if (p.title !== undefined || p.body !== undefined || p.type !== undefined || p.priority !== undefined) {
			if (t.authorId !== me) return fail(403, 'Forbidden', 'Only the author can edit this ticket');
			if (t.status !== 'open') return fail(409, 'Conflict', 'This ticket is no longer open, so it cannot be edited');
		}
		const next: FeedbackDto = {
			...t,
			...(p.title !== undefined ? { title: p.title.trim() } : {}),
			...(p.body !== undefined ? { body: p.body.trim() } : {}),
			...(p.type ? { type: p.type } : {}),
			...(p.priority ? { priority: p.priority } : {}),
			...(p.status ? { status: p.status } : {}),
			...(p.resolutionNotes !== undefined ? { resolutionNotes: p.resolutionNotes.trim() || null } : {}),
			updatedAt: new Date().toISOString()
		};
		tickets[tickets.indexOf(t)] = next;
		return json(next);
	}
	return undefined;
};
