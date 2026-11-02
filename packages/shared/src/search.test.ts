import { describe, expect, it } from 'vitest';
import { cleanQuery, excerpt, highlightParts, likePattern, markRanges } from './search';

describe('search helpers', () => {
	it('cleans and limits the query', () => {
		expect(cleanQuery('  slice   fix ')).toBe('slice fix');
		expect(cleanQuery('a')).toBeUndefined();
		expect(cleanQuery(null)).toBeUndefined();
		expect(cleanQuery('x'.repeat(81))).toBeUndefined();
	});
	it('escapes LIKE wildcards', () => {
		expect(likePattern('50%_a\\')).toBe('%50\\%\\_a\\\\%');
	});
	it('marks exact matches case-insensitively and typo matches', () => {
		expect(markRanges('Fix the Slice today', 'slice')).toEqual([[8, 13]]);
		expect(markRanges('Fix the slice today', 'slcie')).toEqual([[8, 13]]);
		expect(markRanges('Fix the slice today', 'sxxce')).toEqual([]);
		expect(markRanges('Fix the slice today', 'slise')).toEqual([[8, 13]]);
		expect(markRanges('aaa aaa', 'a')).toEqual([]);
	});
	it('windows long text around the first match with ellipses', () => {
		const text = `${'word '.repeat(30)}tempo problem ${'end '.repeat(30)}`;
		const out = excerpt(text, 'tempo');
		expect(out.startsWith('…')).toBe(true);
		expect(out.endsWith('…')).toBe(true);
		expect(out).toContain('tempo');
		expect(out.length).toBeLessThan(130);
		expect(excerpt('short text', 'text')).toBe('short text');
	});
	it('splits into highlight parts', () => {
		expect(highlightParts('hello world', 'world')).toEqual([{ text: 'hello ', match: false }, { text: 'world', match: true }]);
		expect(highlightParts('nothing', 'zzz')).toEqual([{ text: 'nothing', match: false }]);
	});
});
