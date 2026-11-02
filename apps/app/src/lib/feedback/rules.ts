/** TEMPORARY dev tool (docs/system/feedback.md): which one-tap actions a person gets on a ticket. The server enforces the same rules. */
import type { FeedbackStatus, Role } from '@ttg/shared';

export type StatusToggle = { label: 'Mark done' | 'Reopen'; next: 'done' | 'open' };

/**
 * The Mark done / Reopen button. Anyone who can see the ticket gets it on open (done) and done (reopen) tickets. A ticket
 * the coach has put in progress can be marked done by a coach only; a "won't do" ticket has no button (the coach's picker handles it).
 */
export const statusToggle = (status: FeedbackStatus, role: Role): StatusToggle | null => {
	if (status === 'done') return { label: 'Reopen', next: 'open' };
	if (status === 'open' || (status === 'in_progress' && role === 'coach')) return { label: 'Mark done', next: 'done' };
	return null;
};

/** The author deletes their own ticket; a coach deletes any. */
export const canDelete = (role: Role, authorId: string, userId: string) => role === 'coach' || authorId === userId;

/** Edits are for the author while the ticket is open. */
export const canEdit = (status: FeedbackStatus, authorId: string, userId: string) => status === 'open' && authorId === userId;
