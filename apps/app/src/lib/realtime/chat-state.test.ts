import type { MessageDto } from '@ttg/shared';
import { describe, expect, it } from 'vitest';
import { applyReceipts, dayLabel, formatVideoMs, lastSeq, mergeMessages, newestFromOthers, receiptIds, receiptText, videoHref } from './chat-state';

const msg = (seq: number, over: Partial<MessageDto> = {}): MessageDto => ({
	id: `m${seq}`, seq, conversationId: 'c', senderId: 's', body: `b${seq}`, videoId: null, videoMs: null, createdAt: '2026-10-13T10:00:00Z', readAt: null, ...over
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

describe('read receipts', () => {
	const me = 'me';
	const mine = (seq: number, readAt: string | null = null) => msg(seq, { senderId: me, readAt });
	const theirs = (seq: number) => msg(seq, { senderId: 'them' });

	it('mergeMessages adopts a read time for a message it already has, and never un-reads one', () => {
		const read = mine(1, '2026-10-13T10:05:00Z');
		expect(mergeMessages([mine(1)], [read])[0]!.readAt).toBe('2026-10-13T10:05:00Z');
		expect(mergeMessages([read], [mine(1)])).toEqual([read]);
	});

	it('applyReceipts sets readAt on the named messages, keeps others, and returns the same array when nothing changes', () => {
		const list = [mine(1), theirs(2), mine(3)];
		const next = applyReceipts(list, [{ id: 'm1', readAt: '2026-10-13T10:05:00Z' }]);
		expect(next.map((m) => m.readAt)).toEqual(['2026-10-13T10:05:00Z', null, null]);
		expect(applyReceipts(next, [{ id: 'm1', readAt: '2026-10-13T11:00:00Z' }])).toBe(next);
		expect(applyReceipts(list, [])).toBe(list);
	});

	it('newestFromOthers is the highest seq the other side sent, up to an index', () => {
		const list = [theirs(1), mine(2), theirs(3), mine(4), theirs(5)];
		expect(newestFromOthers(list, me)).toBe(5);
		expect(newestFromOthers(list, me, 3)).toBe(3);
		expect(newestFromOthers(list, me, 1)).toBe(1);
		expect(newestFromOthers([mine(1)], me)).toBeUndefined();
	});

	it('shows the receipt on the last of a run and where seen/delivered changes', () => {
		const list = [mine(1, 'x'), mine(2, 'x'), mine(3), theirs(4), mine(5), mine(6)];
		expect([...receiptIds(list, me)]).toEqual(['m2', 'm3', 'm6']);
	});

	it('says Delivered until read, then Seen with the time', () => {
		expect(receiptText(mine(1))).toBe('Delivered');
		expect(receiptText(mine(1, new Date().toISOString()))).toMatch(/^Seen \d{1,2}:\d{2}/);
	});
});
