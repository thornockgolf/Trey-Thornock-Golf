import { Schema } from 'effect';

/**
 * What a practice session contains: one, two or all three of these content areas. Planned and logged sessions carry
 * the same tags; there is no separate "planned" or "impromptu" type.
 */
export const SESSION_TAGS = ['mechanical', 'skill', 'situational'] as const;
export const SessionTag = Schema.Literals(SESSION_TAGS);
export type SessionTag = typeof SessionTag.Type;

/** The labels the UI shows (exact wording from the product decision). */
export const SESSION_TAG_LABELS: Readonly<Record<SessionTag, string>> = {
	mechanical: 'Mechanical technique',
	skill: 'Skill',
	situational: 'Situational practice'
};

/** Tags as a unique, canonical-order array (drops anything unknown, so old or hand-edited JSON never breaks a page). */
export const normalizeTags = (tags: readonly unknown[] | null | undefined): SessionTag[] =>
	SESSION_TAGS.filter((t) => (tags ?? []).includes(t));
