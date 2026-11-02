import { describe, expect, it } from 'vitest';
import { errorCopy } from './error-copy';
import { clerkAppearance, clerkCardAppearance, clerkClass, profileClasses } from './clerk-appearance';
import { readFileSync } from 'node:fs';

describe('errorCopy', () => {
	it('distinguishes a closed account from a role denial', () => {
		expect(errorCopy(403, 'This account has been closed').heading).toBe('This account is closed');
		expect(errorCopy(403, 'Not allowed').heading).toMatch(/access/);
	});
	it('falls back for unknown statuses', () => {
		expect(errorCopy(500).heading).toBe('Something went wrong');
		expect(errorCopy(404).heading).toMatch(/find/);
	});
});

describe('clerkAppearance', () => {
	it('maps variables to theme tokens, never raw brand hex', () => {
		const colors = Object.entries(clerkAppearance.variables).filter(([k]) => k.startsWith('color') && k !== 'colorPrimaryForeground');
		for (const [, v] of colors) expect(v).toMatch(/var\(--/);
		expect(JSON.stringify(clerkAppearance)).not.toMatch(/#(0B4F3A|0E2B5C|D4A017)/i);
	});
	it('keeps window widths off the shared elements (they squeezed the Manage account window)', () => {
		const shared = clerkAppearance.elements as Record<string, Record<string, unknown>>;
		for (const key of ['rootBox', 'cardBox']) {
			expect(shared[key]?.width).toBeUndefined();
			expect(shared[key]?.maxWidth).toBeUndefined();
		}
		expect((clerkCardAppearance.elements.rootBox as { maxWidth: string }).maxWidth).toBe('28rem');
	});
	it('maps the dimmed backdrop to a token', () => {
		expect(clerkAppearance.variables.colorModalBackdrop).toMatch(/var\(--color-/);
	});
	it('targets only known Clerk classes with token colours in clerk.css', () => {
		expect(clerkClass('navbarButton')).toBe('cl-navbarButton');
		const css = readFileSync(new URL('./clerk.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
		expect(css).not.toMatch(/#[0-9a-f]{3,8}\b/i);
		const used = new Set([...css.matchAll(/\.cl-([A-Za-z]+)/g)].map((m) => m[1]!));
		const known = new Set<string>(profileClasses);
		// shared-with-sign-in classes that were already styled before the profile work
		const earlier = ['rootBox', 'formFieldInput', 'socialButtonsBlockButton', 'formFieldInputShowPasswordButton', 'formButtonPrimary', 'footerActionLink', 'footerItem', 'active'];
		for (const c of used) expect(known.has(c) || earlier.includes(c), c).toBe(true);
	});
});
