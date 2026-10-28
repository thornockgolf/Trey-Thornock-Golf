import { describe, expect, it } from 'vitest';
import { isFeedbackEnabled } from './flag';

describe('isFeedbackEnabled', () => {
	it('is on in dev and off in production when unset', () => {
		expect(isFeedbackEnabled(undefined, true)).toBe(true);
		expect(isFeedbackEnabled(undefined, false)).toBe(false);
		expect(isFeedbackEnabled('', false)).toBe(false);
	});
	it('"true" turns it on anywhere, "false" turns it off anywhere, anything else follows dev', () => {
		expect(isFeedbackEnabled('true', false)).toBe(true);
		expect(isFeedbackEnabled(' TRUE ', false)).toBe(true);
		expect(isFeedbackEnabled('false', true)).toBe(false);
		expect(isFeedbackEnabled('1', false)).toBe(false);
	});
});
