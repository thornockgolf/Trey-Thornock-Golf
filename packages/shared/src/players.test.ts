import { describe, expect, it } from 'vitest';
import { unreadThreadHref } from './players';

describe('unreadThreadHref', () => {
	it('opens a video thread on the video page and the general thread in messages', () => {
		expect(unreadThreadHref({ videoId: 'v1', conversationId: 'c1' })).toBe('/videos/v1');
		expect(unreadThreadHref({ videoId: null, conversationId: 'c1' })).toBe('/messages/c1');
	});
});
