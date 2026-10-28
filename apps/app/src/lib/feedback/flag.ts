/** TEMPORARY dev tool (docs/system/feedback.md). Pure so it can be tested; the env reads live in `#lib/server/feedback-flag`. */

/**
 * `PUBLIC_FEEDBACK_ENABLED`: "true" or "false" wins; when unset the feedback section is on in dev and off in production.
 */
export const isFeedbackEnabled = (value: string | undefined, dev: boolean): boolean => {
	const v = value?.trim().toLowerCase();
	if (v === 'true') return true;
	if (v === 'false') return false;
	return dev;
};
