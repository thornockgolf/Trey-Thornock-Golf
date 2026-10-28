import type { MessageDto } from '@ttg/shared';
import { describe, expect, it } from 'vitest';
import { dayLabel, formatVideoMs, lastSeq, mergeMessages, videoHref } from './chat-state';

const msg = (seq: number, over: Partial<MessageDto> = {}): MessageDto => ({
	id: `m${seq}`, seq, conversationId: 'c', senderId: 's', body: `b${seq}`, videoId: null, videoMs: null, createdAt: '2026-10-13T10:00:00Z', ...over
});

describe('mergeMessages', () => {
	it('adds new messages in seq order', () => {
		expect(mergeMessages([msg(1), msg(3)], [msg(2)]).map((m) => m.seq)).toEqual([1, 2, 3]);
	});
	it('never shows a message twice (push, then catch-up)', () => {
		const first = mergeMessages([msg(1)], [msg(2)]);
		expect(mergeMessages(first, [msg(2), msg(2), msg(1)])).toBe(first);
	});
	it('handles an empty thread and an empty batch', () => {
		expect(mergeMessages([], [msg(5), msg(4)]).map((m) => m.seq)).toEqual([4, 5]);
		const cur = [msg(1)];
		expect(mergeMessages(cur, [])).toBe(cur);
	});
});

describe('lastSeq', () => {
	it('is the highest seq, whatever the order', () => {
		expect(lastSeq([])).toBeUndefined();
		expect(lastSeq([msg(2), msg(9), msg(4)])).toBe(9);
	});
});

describe('video references', () => {
	it('formats the time and links to the player at that moment', () => {
		expect(formatVideoMs(3200)).toBe('3.2 s');
		expect(formatVideoMs(65400)).toBe('1:05.4');
		expect(videoHref({ videoId: 'v1', videoMs: 3200 })).toBe('/videos/v1?t=3200');
		expect(videoHref({ videoId: 'v1', videoMs: null })).toBe('/videos/v1');
		expect(videoHref({ videoId: null, videoMs: null })).toBeNull();
	});
});

describe('dayLabel', () => {
	const now = new Date(2026, 9, 13, 12);
	it('names today and yesterday', () => {
		expect(dayLabel(new Date(2026, 9, 13, 8).toISOString(), now)).toBe('Today');
		expect(dayLabel(new Date(2026, 9, 12, 23).toISOString(), now)).toBe('Yesterday');
		expect(dayLabel(new Date(2026, 9, 1, 8).toISOString(), now)).not.toMatch(/Today|Yesterday/);
	});
});

describe('video thread helpers', () => {
	it('formats the playhead as m:ss.t', async () => {
		const { formatPlayhead } = await import('./chat-state');
		expect(formatPlayhead(7300)).toBe('0:07.3');
		expect(formatPlayhead(0)).toBe('0:00.0');
		expect(formatPlayhead(65_450)).toBe('1:05.4');
	});
	it('keeps each thread to its own messages', async () => {
		const { inThread } = await import('./chat-state');
		expect(inThread({ videoId: null }, 'general')).toBe(true);
		expect(inThread({ videoId: 'v' }, 'general')).toBe(false);
		expect(inThread({ videoId: 'v' }, { videoId: 'v' })).toBe(true);
		expect(inThread({ videoId: 'w' }, { videoId: 'v' })).toBe(false);
		expect(inThread({ videoId: null }, { videoId: 'v' })).toBe(false);
		expect(inThread({ videoId: 'w' }, undefined)).toBe(true);
	});
});
