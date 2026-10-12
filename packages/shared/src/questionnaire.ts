import { Schema } from 'effect';

/**
 * Swing intake questionnaire (spec 3.F.1). The question content is typed config here so the server (validation) and
 * the stepper (rendering) share one source. A saved response stores `{ formVersion, values }` in
 * `questionnaire_responses.answers`; the row's own `version` is the player's attempt number (1, 2, ... per retake).
 * Bump `QUESTIONNAIRE_FORM_VERSION` when questions change so old answers stay readable against the form they used.
 */
export const QUESTIONNAIRE_FORM_VERSION = 1;

export const MAX_QUESTIONNAIRE_TEXT = 1000;

export interface QuestionOption {
	readonly value: string;
	readonly label: string;
}

interface QuestionBase {
	readonly id: string;
	readonly label: string;
	readonly help?: string;
	readonly required: boolean;
}

export type Question =
	| (QuestionBase & { readonly type: 'number'; readonly min: number; readonly max: number })
	| (QuestionBase & { readonly type: 'single'; readonly options: readonly QuestionOption[] })
	| (QuestionBase & { readonly type: 'multi'; readonly options: readonly QuestionOption[]; readonly maxSelected?: number })
	| (QuestionBase & { readonly type: 'text'; readonly maxLength: number });

export interface QuestionSection {
	readonly id: string;
	readonly title: string;
	readonly questions: readonly Question[];
}

const opts = (...pairs: [string, string][]): QuestionOption[] => pairs.map(([value, label]) => ({ value, label }));

const direction = (id: string, label: string): Question => ({
	id,
	label,
	type: 'single',
	required: true,
	options: opts(['left', 'Left'], ['right', 'Right'], ['both', 'Both ways'], ['short', 'Short'], ['straight', 'Mostly on target'], ['unsure', 'Not sure'])
});

export const QUESTIONNAIRE_SECTIONS: readonly QuestionSection[] = [
	{
		id: 'about',
		title: 'About you',
		questions: [
			{ id: 'handicap', type: 'number', label: 'Handicap', help: 'Leave blank if you do not have one.', required: false, min: -10, max: 54 },
			{
				id: 'experience',
				type: 'single',
				label: 'How long have you played golf?',
				required: true,
				options: opts(['lt1', 'Less than a year'], ['1to3', '1 to 3 years'], ['3to10', '3 to 10 years'], ['10plus', 'More than 10 years'])
			}
		]
	},
	{
		id: 'miss',
		title: 'Your typical miss',
		questions: [
			{
				id: 'ballFlight',
				type: 'multi',
				label: 'What does the ball usually do?',
				required: true,
				options: opts(['slice', 'Slices'], ['hook', 'Hooks'], ['push', 'Starts right'], ['pull', 'Starts left'], ['high', 'Too high'], ['low', 'Too low'], ['straight', 'Fairly straight'])
			},
			{
				id: 'contact',
				type: 'multi',
				label: 'How is your contact?',
				required: true,
				options: opts(['fat', 'Fat (ground first)'], ['thin', 'Thin or topped'], ['heel', 'Toward the heel'], ['toe', 'Toward the toe'], ['solid', 'Mostly solid'])
			},
			direction('missDriver', 'Where does your driver miss?'),
			direction('missIrons', 'Where do your irons miss?'),
			direction('missWedges', 'Where do your wedges miss?')
		]
	},
	{
		id: 'when',
		title: 'When it happens',
		questions: [
			{
				id: 'whenMiss',
				type: 'multi',
				label: 'When do the misses show up?',
				required: true,
				options: opts(['driver', 'With the driver'], ['irons', 'With the irons'], ['wedges', 'Around the green and with wedges'], ['putting', 'Putting'], ['pressure', 'Under pressure or on the course'])
			}
		]
	},
	{
		id: 'body',
		title: 'Pain or limitations',
		questions: [
			{
				id: 'limitations',
				type: 'multi',
				label: 'Anything that limits your swing?',
				required: true,
				options: opts(['none', 'Nothing'], ['back', 'Back'], ['shoulder', 'Shoulder'], ['elbow-wrist', 'Elbow or wrist'], ['hip-knee', 'Hip or knee'], ['other', 'Something else'])
			},
			{ id: 'limitationsNotes', type: 'text', label: 'Tell Trey more', required: false, maxLength: MAX_QUESTIONNAIRE_TEXT }
		]
	},
	{
		id: 'goals',
		title: 'Goals',
		questions: [
			{
				id: 'goals',
				type: 'multi',
				label: 'What do you want most?',
				help: 'Pick up to three.',
				required: true,
				maxSelected: 3,
				options: opts(['scores', 'Lower my scores'], ['consistency', 'Be more consistent'], ['distance', 'Hit it farther'], ['driving', 'Better driving'], ['irons', 'Better iron play'], ['short-game', 'Better short game'], ['putting', 'Better putting'], ['compete', 'Prepare to compete'])
			},
			{ id: 'goalTarget', type: 'text', label: 'A specific target?', help: 'For example: break 90 this season.', required: false, maxLength: 200 }
		]
	},
	{
		id: 'time',
		title: 'Time to practice',
		questions: [
			{
				id: 'hoursPerWeek',
				type: 'single',
				label: 'How much can you practice each week?',
				required: true,
				options: opts(['lt1', 'Under 1 hour'], ['1to2', '1 to 2 hours'], ['3to4', '3 to 4 hours'], ['5plus', '5 hours or more'])
			},
			{ id: 'notes', type: 'text', label: 'Anything else Trey should know?', required: false, maxLength: MAX_QUESTIONNAIRE_TEXT }
		]
	}
];

const ALL_QUESTIONS: readonly Question[] = QUESTIONNAIRE_SECTIONS.flatMap((s) => s.questions);
const BY_ID = new Map(ALL_QUESTIONS.map((q) => [q.id, q] as const));

export type AnswerValue = number | string | readonly string[];
export type QuestionnaireValues = Readonly<Record<string, AnswerValue>>;

/** What `questionnaire_responses.answers` holds. */
export interface StoredAnswers {
	readonly formVersion: number;
	readonly values: QuestionnaireValues;
}

export interface QuestionnaireIssue {
	readonly questionId: string;
	readonly message: string;
}

export interface ValidationResult {
	/** Known questions only, with blank answers dropped. */
	readonly values: QuestionnaireValues;
	readonly issues: readonly QuestionnaireIssue[];
}

const isBlank = (v: unknown) => v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);

const checkOne = (q: Question, raw: unknown): { value?: AnswerValue; issue?: string } => {
	if (isBlank(raw)) return q.required ? { issue: 'Answer this question' } : {};
	switch (q.type) {
		case 'number':
			if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < q.min || raw > q.max) return { issue: `Enter a number from ${q.min} to ${q.max}` };
			return { value: raw };
		case 'single':
			if (typeof raw !== 'string' || !q.options.some((o) => o.value === raw)) return { issue: 'Choose one of the options' };
			return { value: raw };
		case 'multi': {
			if (!Array.isArray(raw) || raw.some((v) => typeof v !== 'string')) return { issue: 'Choose from the options' };
			const picked = [...new Set(raw as string[])];
			if (picked.some((v) => !q.options.some((o) => o.value === v))) return { issue: 'Choose from the options' };
			if (q.maxSelected && picked.length > q.maxSelected) return { issue: `Choose at most ${q.maxSelected}` };
			return { value: picked };
		}
		case 'text': {
			if (typeof raw !== 'string') return { issue: 'Enter text' };
			const text = raw.trim();
			if (text.length > q.maxLength) return { issue: `Keep this under ${q.maxLength} characters` };
			return text ? { value: text } : q.required ? { issue: 'Answer this question' } : {};
		}
	}
};

/**
 * Validate answers against the form. A draft (`complete: false`) only checks answers that are present; a submit also
 * requires every required question. Unknown ids are dropped, never stored.
 */
export const validateAnswers = (answers: Readonly<Record<string, unknown>>, opts: { complete: boolean }): ValidationResult => {
	const values: Record<string, AnswerValue> = {};
	const issues: QuestionnaireIssue[] = [];
	for (const q of ALL_QUESTIONS) {
		const raw = answers[q.id];
		const { value, issue } = checkOne(q, raw);
		if (value !== undefined) values[q.id] = value;
		// A draft may leave required questions unanswered; a present-but-invalid answer is always an issue.
		if (issue && (opts.complete || !isBlank(raw))) issues.push({ questionId: q.id, message: issue });
	}
	return { values, issues };
};

export interface DescribedAnswer {
	readonly questionId: string;
	readonly label: string;
	/** The answer in words (option labels, not stored values). */
	readonly text: string;
}
export interface DescribedSection {
	readonly id: string;
	readonly title: string;
	readonly answers: readonly DescribedAnswer[];
}

/**
 * Stored answers as the coach reads them: by section, in form order, with option labels instead of stored values.
 * Unanswered questions are left out; a value the form no longer knows is shown as it was stored.
 */
export const describeAnswers = (values: QuestionnaireValues): DescribedSection[] =>
	QUESTIONNAIRE_SECTIONS.map((section) => ({
		id: section.id,
		title: section.title,
		answers: section.questions.flatMap((q): DescribedAnswer[] => {
			const v = values[q.id];
			if (isBlank(v)) return [];
			const label = (value: string) => ('options' in q ? q.options.find((o) => o.value === value)?.label : undefined) ?? value;
			const text = Array.isArray(v) ? v.map(label).join(', ') : typeof v === 'string' ? label(v) : String(v);
			return [{ questionId: q.id, label: q.label, text }];
		})
	})).filter((s) => s.answers.length > 0);

export const questionLabel = (id: string) => BY_ID.get(id)?.label ?? id;

const AnswerValueSchema = Schema.Union([
	Schema.Number.pipe(Schema.check(Schema.isFinite())),
	Schema.String.pipe(Schema.check(Schema.isMaxLength(MAX_QUESTIONNAIRE_TEXT))),
	Schema.Array(Schema.String.pipe(Schema.check(Schema.isMaxLength(64)))).pipe(Schema.check(Schema.isMaxLength(20)))
]);

/** `POST /api/questionnaire`: save a draft, or submit (`submit: true`) to complete it. */
export const SaveQuestionnaireRequest = Schema.Struct({
	answers: Schema.Record(Schema.String.pipe(Schema.check(Schema.isMaxLength(64))), AnswerValueSchema),
	submit: Schema.Boolean
});
export type SaveQuestionnaireRequest = typeof SaveQuestionnaireRequest.Type;

export interface QuestionnaireResponseDto {
	readonly id: string;
	readonly userId: string;
	/** The player's attempt number: 1, then 2 after a retake. */
	readonly version: number;
	readonly formVersion: number;
	readonly answers: QuestionnaireValues;
	readonly completedAt: string | null;
	readonly updatedAt: string;
}
