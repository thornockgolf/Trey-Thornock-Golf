import { describe, expect, it } from 'vitest';
import { isActive, navFor } from './nav';

describe('navFor', () => {
	it('gives players and coaches different primary destinations', () => {
		expect(navFor('player').main.map((i) => i.label)).toContain('Billing');
		expect(navFor('coach').main.map((i) => i.label)).toContain('Library');
		expect(navFor('coach').main.map((i) => i.label)).not.toContain('Billing');
		expect(navFor('player').main.map((i) => i.href)).not.toContain('/coach');
	});

	it('keeps the phone bar to five items with the upload action in the center', () => {
		for (const role of ['player', 'coach'] as const) {
			const { bottom } = navFor(role);
			expect(bottom).toHaveLength(5);
			expect(bottom[2]!.icon).toBe('upload');
		}
	});

	it('only enables destinations that exist, so the shell never links to a 404', () => {
		const enabled = (r: 'player' | 'coach') => navFor(r).main.filter((i) => i.enabled).map((i) => i.href);
		expect(enabled('player')).toEqual(['/', '/videos', '/compare', '/plans']);
		expect(enabled('coach')).toEqual(['/coach', '/videos', '/compare', '/coach/library', '/coach/plans']);
		for (const r of ['player', 'coach'] as const) {
			expect(navFor(r).upload).toMatchObject({ href: '/videos/new', enabled: true });
			expect(navFor(r).bottom.filter((i) => i.enabled).map((i) => i.href)).toEqual(r === 'coach' ? ['/coach', '/videos', '/videos/new', '/coach/library'] : ['/', '/videos', '/videos/new', '/plans']);
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

describe('offline behavior', () => {
	it('marks upload and messages as needing the network', () => {
		for (const role of ['player', 'coach'] as const) {
			const n = navFor(role);
			expect(n.upload.needsNetwork).toBe(true);
			expect(n.main.find((i) => i.icon === 'messages')?.needsNetwork).toBe(true);
			expect(n.bottom.find((i) => i.icon === 'messages')?.needsNetwork).toBe(true);
			expect(n.main.find((i) => i.icon === 'home' || i.icon === 'dashboard')?.needsNetwork).toBeFalsy();
		}
	});
});
