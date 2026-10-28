/**
 * TEMPORARY dev tool: in-app feedback tickets (a product owner's change requests while testing).
 * Outside Parts A-G. To remove it, see docs/system/feedback.md.
 */
import { Schema } from 'effect';

export const FEEDBACK_TYPES = ['bug', 'change', 'idea'] as const;
export type FeedbackType = (typeof FEEDBACK_TYPES)[number];
export const FEEDBACK_PRIORITIES = ['low', 'normal', 'high'] as const;
export type FeedbackPriority = (typeof FEEDBACK_PRIORITIES)[number];
export const FEEDBACK_STATUSES = ['open', 'in_progress', 'done', 'wont_do'] as const;
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];

export const FEEDBACK_TYPE_LABEL: Record<FeedbackType, string> = { bug: 'Bug', change: 'Change', idea: 'Idea' };
export const FEEDBACK_PRIORITY_LABEL: Record<FeedbackPriority, string> = { low: 'Low', normal: 'Normal', high: 'High' };
export const FEEDBACK_STATUS_LABEL: Record<FeedbackStatus, string> = { open: 'Open', in_progress: 'In progress', done: 'Done', wont_do: "Won't do" };

export const MAX_FEEDBACK_TITLE = 120;
export const MAX_FEEDBACK_BODY = 4000;
export const MAX_FEEDBACK_NOTES = 4000;

const Type = Schema.Literals(FEEDBACK_TYPES);
const Priority = Schema.Literals(FEEDBACK_PRIORITIES);
const Status = Schema.Literals(FEEDBACK_STATUSES);
const Text = (max: number) => Schema.String.pipe(Schema.check(Schema.isPattern(/\S/), Schema.isMaxLength(max)));

/** `POST /api/feedback`. The role is taken from the session, never from the body. */
export const CreateFeedbackRequest = Schema.Struct({
	title: Text(MAX_FEEDBACK_TITLE),
	body: Text(MAX_FEEDBACK_BODY),
	type: Type,
	priority: Schema.optional(Priority),
	pagePath: Schema.optional(Schema.String.pipe(Schema.check(Schema.isMaxLength(1000)))),
	viewport: Schema.optional(Schema.String.pipe(Schema.check(Schema.isMaxLength(40)))),
	userAgent: Schema.optional(Schema.String.pipe(Schema.check(Schema.isMaxLength(1000))))
});
export type CreateFeedbackRequest = typeof CreateFeedbackRequest.Type;

/** `PATCH /api/feedback/:id`: the author edits the text while open; a coach also sets `status` and `resolutionNotes`. */
export const UpdateFeedbackRequest = Schema.Struct({
	title: Schema.optional(Text(MAX_FEEDBACK_TITLE)),
	body: Schema.optional(Text(MAX_FEEDBACK_BODY)),
	type: Schema.optional(Type),
	priority: Schema.optional(Priority),
	status: Schema.optional(Status),
	resolutionNotes: Schema.optional(Schema.String.pipe(Schema.check(Schema.isMaxLength(MAX_FEEDBACK_NOTES))))
});
export type UpdateFeedbackRequest = typeof UpdateFeedbackRequest.Type;

export interface FeedbackDto {
	readonly id: string;
	readonly authorId: string;
	readonly authorName: string | null;
	readonly authorRole: 'player' | 'coach';
	readonly title: string;
	readonly body: string;
	readonly type: FeedbackType;
	readonly priority: FeedbackPriority;
	readonly status: FeedbackStatus;
	readonly pagePath: string;
	readonly viewport: string;
	readonly userAgent: string;
	readonly resolutionNotes: string | null;
	readonly createdAt: string;
	readonly updatedAt: string;
}

export interface FeedbackListDto {
	readonly tickets: readonly FeedbackDto[];
}

/** The `?status=` of the export: one status, or `all`. Anything else falls back to `open`. */
export const parseExportStatus = (raw: string | null | undefined): FeedbackStatus | 'all' =>
	raw === 'all' ? 'all' : (FEEDBACK_STATUSES as readonly string[]).includes(raw ?? '') ? (raw as FeedbackStatus) : 'open';

const PRIORITY_RANK: Record<FeedbackPriority, number> = { high: 0, normal: 1, low: 2 };

/** Short handle for a ticket: `FB-` and the first 8 characters of its id. */
export const feedbackRef = (id: string) => `FB-${id.slice(0, 8)}`;

/** A fenced block that cannot be broken out of by backticks in the text. */
const fence = (text: string) => {
	const longest = Math.max(2, ...[...text.matchAll(/`+/g)].map((m) => m[0].length));
	const ticks = '`'.repeat(longest + 1);
	return `${ticks}text\n${text.trim()}\n${ticks}`;
};

/**
 * Markdown for a coding agent: one section per ticket, high priority first, then oldest first. The ticket text is the
 * product owner's words, quoted in fenced blocks so the agent treats it as a request to read, not as instructions about itself.
 */
export const formatFeedbackMarkdown = (
	tickets: readonly FeedbackDto[],
	options: { status: FeedbackStatus | 'all'; generatedAt: Date }
): string => {
	const sorted = [...tickets].sort(
		(a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || a.createdAt.localeCompare(b.createdAt)
	);
	const scope = options.status === 'all' ? 'all statuses' : `status: ${FEEDBACK_STATUS_LABEL[options.status]}`;
	const out = [
		'# Feedback tickets',
		'',
		`Generated ${options.generatedAt.toISOString()} (${scope}). ${sorted.length} ticket${sorted.length === 1 ? '' : 's'}.`,
		'',
		'Each ticket is a change request from the product owner, filed from inside the running app. "Page" is the URL path the person was on, and "Viewport" the browser size, so you can reproduce what they saw. Work through them in order (high priority first). Unless a ticket says otherwise, follow the repo conventions in CLAUDE.md. When a ticket is done, say what you changed so the owner can set its status in the app.'
	];
	if (sorted.length === 0) out.push('', '_No tickets._');
	for (const t of sorted) {
		out.push(
			'',
			'---',
			'',
			`## ${feedbackRef(t.id)}: ${t.title.replace(/\s+/g, ' ').trim()}`,
			'',
			`- ID: ${t.id}`,
			`- Type: ${FEEDBACK_TYPE_LABEL[t.type]}`,
			`- Priority: ${FEEDBACK_PRIORITY_LABEL[t.priority]}`,
			`- Status: ${FEEDBACK_STATUS_LABEL[t.status]}`,
			`- Page: ${t.pagePath ? `\`${t.pagePath.replace(/`/g, '')}\`` : 'unknown'}`,
			`- Filed as: ${t.authorRole}${t.authorName ? ` (${t.authorName.replace(/\s+/g, ' ')})` : ''}`,
			`- Viewport: ${t.viewport || 'unknown'}`,
			`- Filed: ${t.createdAt}`,
			...(t.userAgent ? [`- User agent: ${t.userAgent.replace(/\s+/g, ' ')}`] : []),
			'',
			'### Request',
			'',
			fence(t.body)
		);
		if (t.resolutionNotes?.trim()) out.push('', '### Notes', '', fence(t.resolutionNotes));
	}
	return out.join('\n') + '\n';
};
