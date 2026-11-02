import { describe, expect, it } from 'vitest';
import { canDelete, canEdit, statusToggle } from './rules';

describe('feedback rules', () => {
	it('offers Mark done on open, Reopen on done, and nothing on won\'t do', () => {
		expect(statusToggle('open', 'player')).toEqual({ label: 'Mark done', next: 'done' });
		expect(statusToggle('done', 'player')).toEqual({ label: 'Reopen', next: 'open' });
		expect(statusToggle('wont_do', 'player')).toBeNull();
		expect(statusToggle('wont_do', 'coach')).toBeNull();
	});
	it('lets only a coach finish a ticket that is in progress', () => {
		expect(statusToggle('in_progress', 'player')).toBeNull();
		expect(statusToggle('in_progress', 'coach')).toEqual({ label: 'Mark done', next: 'done' });
	});
	it('the author or a coach deletes; the author edits only while open', () => {
		expect(canDelete('player', 'me', 'me')).toBe(true);
		expect(canDelete('player', 'other', 'me')).toBe(false);
		expect(canDelete('coach', 'other', 'me')).toBe(true);
		expect(canEdit('open', 'me', 'me')).toBe(true);
		expect(canEdit('done', 'me', 'me')).toBe(false);
		expect(canEdit('open', 'other', 'me')).toBe(false);
	});
});
