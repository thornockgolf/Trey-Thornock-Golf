/** Pure helpers for the questionnaire stepper: per-step validation and the summary labels. */
import {
	QUESTIONNAIRE_SECTIONS,
	validateAnswers,
	type AnswerValue,
	type Question,
	type QuestionSection,
	type QuestionnaireIssue,
	type QuestionnaireValues
} from '@ttg/shared';

/** Issues for one step only: every required question in it must be answered, and every answer in it must be valid. */
export const stepIssues = (section: QuestionSection, values: Readonly<Record<string, unknown>>): QuestionnaireIssue[] => {
	const ids = new Set(section.questions.map((q) => q.id));
	return validateAnswers(values, { complete: true }).issues.filter((i) => ids.has(i.questionId));
};

/** The first step with an issue, so a failed submit can jump to it; -1 when everything is valid. */
export const firstInvalidStep = (values: Readonly<Record<string, unknown>>, sections: readonly QuestionSection[] = QUESTIONNAIRE_SECTIONS) =>
	sections.findIndex((s) => stepIssues(s, values).length > 0);

/** A stored answer as readable text, for the summary. */
export const answerText = (q: Question, value: AnswerValue | undefined): string => {
	if (value === undefined) return 'Not answered';
	if (q.type === 'single') return q.options.find((o) => o.value === value)?.label ?? String(value);
	if (q.type === 'multi') {
		const picked = value as readonly string[];
		return picked.map((v) => q.options.find((o) => o.value === v)?.label ?? v).join(', ');
	}
	return String(value);
};

export const toggleValue = (current: readonly string[] | undefined, value: string): string[] => {
	const set = new Set(current ?? []);
	if (set.has(value)) set.delete(value);
	else set.add(value);
	return [...set];
};

/** Drop blank entries before sending: empty strings and empty selections are "unanswered". */
export const cleanForSave = (values: Readonly<Record<string, AnswerValue | undefined>>): QuestionnaireValues => {
	const out: Record<string, AnswerValue> = {};
	for (const [k, v] of Object.entries(values)) {
		if (v === undefined || v === '' || (Array.isArray(v) && v.length === 0)) continue;
		if (typeof v === 'number' && !Number.isFinite(v)) continue;
		out[k] = v;
	}
	return out;
};
