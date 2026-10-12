import { describe, expect, it } from 'vitest';
import { QUESTIONNAIRE_SECTIONS, validateAnswers } from './questionnaire';

const complete = {
	experience: '3to10',
	ballFlight: ['slice'],
	contact: ['fat', 'thin'],
	missDriver: 'right',
	missIrons: 'left',
	missWedges: 'short',
	whenMiss: ['driver', 'pressure'],
	limitations: ['none'],
	goals: ['scores', 'driving'],
	hoursPerWeek: '3to4'
};

describe('validateAnswers', () => {
	it('accepts a complete submission; optional questions may be blank', () => {
		const r = validateAnswers(complete, { complete: true });
		expect(r.issues).toEqual([]);
		expect(r.values.ballFlight).toEqual(['slice']);
	});

	it('names every missing required question on submit', () => {
		const { issues } = validateAnswers({ experience: '1to3' }, { complete: true });
		const ids = issues.map((i) => i.questionId);
		expect(ids).toContain('ballFlight');
		expect(ids).toContain('hoursPerWeek');
		expect(ids).not.toContain('experience');
		expect(ids).not.toContain('handicap');
	});

	it('lets a draft leave required questions blank', () => {
		expect(validateAnswers({ experience: '1to3' }, { complete: false }).issues).toEqual([]);
		expect(validateAnswers({}, { complete: false }).issues).toEqual([]);
	});

	it('rejects bad values even in a draft', () => {
		const { issues } = validateAnswers({ experience: 'forever', handicap: 99, goals: ['scores', 'driving', 'irons', 'putting'] }, { complete: false });
		expect(issues.map((i) => i.questionId).sort()).toEqual(['experience', 'goals', 'handicap']);
	});

	it('accepts a handicap in -10..54 and drops unknown ids, blank text and duplicate picks', () => {
		const r = validateAnswers({ ...complete, handicap: 12.4, bogus: 'x', notes: '   ', goals: ['scores', 'scores'] }, { complete: true });
		expect(r.issues).toEqual([]);
		expect(r.values.handicap).toBe(12.4);
		expect(r.values).not.toHaveProperty('bogus');
		expect(r.values).not.toHaveProperty('notes');
		expect(r.values.goals).toEqual(['scores']);
	});
});

describe('form config', () => {
	it('has unique question ids', () => {
		const ids = QUESTIONNAIRE_SECTIONS.flatMap((s) => s.questions.map((q) => q.id));
		expect(new Set(ids).size).toBe(ids.length);
	});
});

import { describeAnswers } from './questionnaire';

describe('describeAnswers', () => {
	it('groups answers by section, in words, and skips what was not answered', () => {
		const d = describeAnswers({ handicap: 12, experience: '3to10' });
		expect(d).toHaveLength(1);
		expect(d[0]!.answers).toEqual([
			{ questionId: 'handicap', label: 'Handicap', text: '12' },
			{ questionId: 'experience', label: 'How long have you played golf?', text: '3 to 10 years' }
		]);
	});
	it('shows an unknown stored value as it was stored, and nothing for an empty answer set', () => {
		expect(describeAnswers({ experience: 'something-old' })[0]!.answers[0]!.text).toBe('something-old');
		expect(describeAnswers({})).toEqual([]);
	});
});
