import { QUESTIONNAIRE_SECTIONS } from '@ttg/shared';
import { describe, expect, it } from 'vitest';
import { answerText, cleanForSave, firstInvalidStep, stepIssues, toggleValue } from './steps';

const [about, miss] = QUESTIONNAIRE_SECTIONS;

describe('stepIssues', () => {
	it('flags only the questions in that step', () => {
		expect(stepIssues(about!, {}).map((i) => i.questionId)).toEqual(['experience']);
		expect(stepIssues(about!, { experience: '1to3' })).toEqual([]);
		expect(stepIssues(miss!, { experience: '1to3' }).map((i) => i.questionId)).toContain('ballFlight');
	});
});

describe('firstInvalidStep', () => {
	it('finds the earliest step that still needs answers', () => {
		expect(firstInvalidStep({})).toBe(0);
		expect(firstInvalidStep({ experience: '1to3' })).toBe(1);
	});
});

describe('helpers', () => {
	it('toggles multi-select values', () => {
		expect(toggleValue(undefined, 'a')).toEqual(['a']);
		expect(toggleValue(['a', 'b'], 'a')).toEqual(['b']);
	});
	it('drops blanks before saving', () => {
		expect(cleanForSave({ a: '', b: [], c: Number.NaN, d: 'x', e: 0 })).toEqual({ d: 'x', e: 0 });
	});
	it('renders answers as labels', () => {
		const q = about!.questions.find((x) => x.id === 'experience')!;
		expect(answerText(q, '1to3')).toBe('1 to 3 years');
		expect(answerText(q, undefined)).toBe('Not answered');
	});
});
