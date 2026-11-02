import { describe, expect, it } from 'vitest';
import { isActive, navFor, overflowItems } from './nav';

describe('navFor', () => {
	it('gives players and coaches different primary destinations', () => {
		expect(navFor('player').main.map((i) => i.label)).toContain('Billing');
		expect(navFor('coach').main.map((i) => i.label)).toContain('Library');
		expect(navFor('coach').main.map((i) => i.label)).not.toContain('Billing');
		expect(navFor('coach').main.map((i) => i.label)).not.toContain('Videos');
		expect(navFor('coach').bottom.map((i) => i.label)).not.toContain('Videos');
		expect(navFor('player').main.map((i) => i.label)).toContain('Videos');
		expect(navFor('player').main.map((i) => i.href)).not.toContain('/coach');
	});

	it('keeps the phone bar to at most five items and has no upload item', () => {
		for (const role of ['player', 'coach'] as const) {
			const { bottom, main } = navFor(role);
			expect(bottom.length).toBeLessThanOrEqual(5);
			expect([...bottom, ...main].some((i) => i.href === '/videos/new' || i.label === 'Upload')).toBe(false);
		}
	});

	it('only enables destinations that exist, so the shell never links to a 404', () => {
		const enabled = (r: 'player' | 'coach') => navFor(r).main.filter((i) => i.enabled).map((i) => i.href);
		expect(enabled('player')).toEqual(['/', '/videos', '/plans', '/calendar', '/profile', '/billing']);
		expect(enabled('coach')).toEqual(['/coach', '/coach/library', '/coach/plans']);
		for (const r of ['player', 'coach'] as const) {
			expect(navFor(r).bottom.filter((i) => i.enabled).map((i) => i.href)).toEqual(r === 'coach' ? ['/coach', '/coach/plans', '/coach/library'] : ['/', '/videos', '/calendar', '/plans']);
		}
	});
});

describe('isActive', () => {
	const home = { href: '/' };
	const coach = { href: '/coach' };
	const videos = { href: '/videos' };

	it('treats section roots as exact matches', () => {
		expect(isActive('/', home)).toBe(true);
		expect(isActive('/videos', home)).toBe(false);
		expect(isActive('/coach', coach)).toBe(true);
		expect(isActive('/coach/players/1', coach)).toBe(false);
	});

	it('matches nested routes for other items but not lookalikes', () => {
		expect(isActive('/videos', videos)).toBe(true);
		expect(isActive('/videos/abc', videos)).toBe(true);
		expect(isActive('/videos-archive', videos)).toBe(false);
	});
});

describe('removed destinations', () => {
	it('keeps Messages and Compare out of the navigation (compare starts from a video; chat from the bell and video threads)', () => {
		for (const role of ['player', 'coach'] as const) {
			const n = navFor(role);
			for (const i of [...n.main, ...n.bottom]) {
				expect(['/messages', '/compare']).not.toContain(i.href);
				expect(i.icon).not.toBe('messages');
			}
		}
	});
});

describe('overflowItems', () => {
	it('lists main destinations the phone bar does not show', () => {
		expect(overflowItems(navFor('player')).map((i) => i.href)).toEqual(['/profile', '/billing']);
		expect(overflowItems(navFor('coach')).map((i) => i.href)).toEqual([]);
	});

	it('includes extra main items such as Feedback and never repeats a bottom item', () => {
		const base = navFor('player');
		const nav = { ...base, main: [...base.main, { label: 'Feedback', href: '/feedback', icon: 'feedback' as const, enabled: true }] };
		const hrefs = overflowItems(nav).map((i) => i.href);
		expect(hrefs).toContain('/feedback');
		for (const b of base.bottom) expect(hrefs).not.toContain(b.href);
	});
});
