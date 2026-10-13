import type { ProfileDto } from '@ttg/shared';
import { describe, expect, it } from 'vitest';
import { formFrom, formProblems, initials, parseHandicap, photoProblem, toRequest } from './profile-form';

const profile: ProfileDto = {
	userId: 'u', displayName: 'Sam Rivera', email: 's@x.com', handicap: 14.5, goals: 'Break 90', homeCourse: null, hand: 'left', equipment: null, limitations: null, photoUrl: null,
	summary: { videos: 0, plan: null, subscriptionStatus: null }
};

describe('parseHandicap', () => {
	it('reads dots and commas, blank as none, and junk as NaN', () => {
		expect(parseHandicap('14.5')).toBe(14.5);
		expect(parseHandicap(' 14,5 ')).toBe(14.5);
		expect(parseHandicap('-3')).toBe(-3);
		expect(parseHandicap('')).toBeNull();
		expect(parseHandicap('abc')).toBeNaN();
		expect(parseHandicap('1e3')).toBeNaN();
	});
});

describe('formProblems', () => {
	const f = formFrom(profile);
	it('accepts the range -10 to 54 and a blank handicap', () => {
		for (const h of ['-10', '0', '54', '', '18,2']) expect(formProblems({ ...f, handicap: h }).handicap).toBeUndefined();
	});
	it('names the handicap when it is out of range or not a number', () => {
		for (const h of ['-11', '54.1', '100', 'high']) expect(formProblems({ ...f, handicap: h }).handicap).toMatch(/-10 to 54/);
	});
	it('limits text lengths', () => {
		expect(formProblems({ ...f, goals: 'x'.repeat(1001) }).goals).toBeDefined();
		expect(formProblems({ ...f, displayName: 'x'.repeat(81) }).displayName).toBeDefined();
		expect(formProblems(f)).toEqual({});
	});
});

describe('toRequest', () => {
	it('sends blanks as null so they clear what was stored', () => {
		expect(toRequest({ ...formFrom(profile), goals: '  ', handicap: '', hand: '' })).toEqual({
			displayName: 'Sam Rivera', handicap: null, goals: null, homeCourse: null, hand: null, equipment: null, limitations: null
		});
		expect(toRequest(formFrom(profile))).toMatchObject({ handicap: 14.5, hand: 'left', goals: 'Break 90' });
	});
});

describe('photoProblem', () => {
	it('accepts small images only', () => {
		expect(photoProblem({ type: 'image/jpeg', size: 1000 })).toBeUndefined();
		expect(photoProblem({ type: 'image/gif', size: 1000 })).toMatch(/JPEG, PNG or WebP/);
		expect(photoProblem({ type: 'image/png', size: 6 * 1024 * 1024 })).toMatch(/under 5 MB/);
		expect(photoProblem({ type: 'image/png', size: 0 })).toMatch(/empty/);
	});
});

describe('initials', () => {
	it('uses first and last name, else the email', () => {
		expect(initials({ displayName: 'Sam Rivera', email: null })).toBe('SR');
		expect(initials({ displayName: 'Sam', email: null })).toBe('S');
		expect(initials({ displayName: null, email: 'jo@x.com' })).toBe('J');
		expect(initials({ displayName: null, email: null })).toBe('?');
	});
});
