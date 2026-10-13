import { describe, expect, it } from 'vitest';
import { timeAgo } from './time-ago';

const now = new Date('2026-10-13T12:00:00Z');
describe('timeAgo', () => {
	it('uses the coarsest unit that fits', () => {
		expect(timeAgo('2026-10-13T11:59:50Z', now)).toBe('just now');
		expect(timeAgo('2026-10-13T11:55:00Z', now)).toBe('5 min ago');
		expect(timeAgo('2026-10-13T09:00:00Z', now)).toBe('3 h ago');
		expect(timeAgo('2026-10-12T08:00:00Z', now)).toBe('Yesterday');
		expect(timeAgo('2026-10-01T08:00:00Z', now)).not.toMatch(/ago|Yesterday/);
	});
	it('never goes negative for a clock a little ahead', () => {
		expect(timeAgo('2026-10-13T12:00:30Z', now)).toBe('just now');
	});
});
