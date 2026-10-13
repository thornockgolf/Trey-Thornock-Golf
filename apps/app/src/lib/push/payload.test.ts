import { describe, expect, it } from 'vitest';
import { parsePush } from './payload';

const O = 'https://app.treythornockgolf.com';

describe('parsePush', () => {
	it('reads the title, tag and link', () => {
		expect(parsePush(JSON.stringify({ title: 'New message from Sam', href: '/messages/c1', tag: 'conversation-c1' }), O)).toEqual({
			title: 'New message from Sam',
			url: `${O}/messages/c1`,
			tag: 'conversation-c1'
		});
	});

	it('never opens another origin', () => {
		for (const href of ['https://evil.example.com/x', '//evil.example.com/x', 'javascript:alert(1)'])
			expect(parsePush(JSON.stringify({ title: 't', href }), O).url, href).toBe(`${O}/notifications`);
	});

	it('still shows something for an empty, missing or broken payload', () => {
		for (const raw of [undefined, '', 'not json', '{}', '[]', JSON.stringify({ title: 42 })]) {
			const p = parsePush(raw, O);
			expect([p.title, p.url, p.tag], String(raw)).toEqual(['New notification', `${O}/notifications`, 'ttg']);
		}
	});
});
