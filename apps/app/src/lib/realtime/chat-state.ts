import type { MessageDto } from '@ttg/shared';

/**
 * Merge messages into a thread: one entry per id (a message that arrives by push and again by
 * catch-up appears once), ordered by `seq`. Returns the same array when nothing changed.
 */
export const mergeMessages = (current: readonly MessageDto[], incoming: readonly MessageDto[]): readonly MessageDto[] => {
	const byId = new Map(current.map((m) => [m.id, m]));
	let changed = false;
	for (const m of incoming) {
		const have = byId.get(m.id);
		if (!have) {
			byId.set(m.id, m);
			changed = true;
		} else if (!have.readAt && m.readAt) {
			// the same message again, now read: keep the newer state
			byId.set(m.id, { ...have, readAt: m.readAt });
			changed = true;
		}
	}
	if (!changed) return current;
	return [...byId.values()].sort((a, b) => a.seq - b.seq);
};

/** The cursor for catching up: the highest `seq` held, or undefined for an empty thread. */
export const lastSeq = (messages: readonly MessageDto[]): number | undefined => messages.reduce<number | undefined>((hi, m) => (hi === undefined || m.seq > hi ? m.seq : hi), undefined);

/** "3.2 s" / "1:05.4" for a message's video reference. */
export const formatVideoMs = (ms: number) => {
	const total = ms / 1000;
	if (total < 60) return `${Math.round(total * 10) / 10} s`;
	const m = Math.floor(total / 60);
	return `${m}:${(total - m * 60).toFixed(1).padStart(4, '0')}`;
};

/** "0:07.3": the playhead as m:ss.t, the chip on a message sent from a video page. */
export const formatPlayhead = (ms: number) => {
	const tenths = Math.floor(Math.max(0, ms) / 100);
	const m = Math.floor(tenths / 600);
	const sec = Math.floor((tenths % 600) / 10);
	return `${m}:${String(sec).padStart(2, '0')}.${tenths % 10}`;
};

/** Whether a message belongs in a thread: the general one holds messages tied to no video, a video's holds that video's. */
export const inThread = (m: Pick<MessageDto, 'videoId'>, scope: 'general' | { videoId: string } | undefined) =>
	scope === undefined ? true : scope === 'general' ? m.videoId === null : m.videoId === scope.videoId;

/** Where a message's video chip goes: the player page opened at that time. */
export const videoHref = (m: Pick<MessageDto, 'videoId' | 'videoMs'>) => (m.videoId ? `/videos/${m.videoId}${m.videoMs !== null ? `?t=${m.videoMs}` : ''}` : null);

/** A day divider label for messages sent on different days. */
export const dayLabel = (iso: string, now: Date = new Date()) => {
	const d = new Date(iso);
	const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
	if (sameDay(d, now)) return 'Today';
	const y = new Date(now);
	y.setDate(now.getDate() - 1);
	if (sameDay(d, y)) return 'Yesterday';
	return d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
};

/**
 * Fold read receipts (`GET .../receipts`) into a thread: a message the other side has read gets its `readAt`. Never
 * un-reads one. Returns the same array when nothing changed.
 */
export const applyReceipts = (current: readonly MessageDto[], receipts: readonly { id: string; readAt: string }[]): readonly MessageDto[] => {
	const byId = new Map(receipts.map((r) => [r.id, r.readAt]));
	let changed = false;
	const next = current.map((m) => {
		const at = byId.get(m.id);
		if (at && !m.readAt) {
			changed = true;
			return { ...m, readAt: at };
		}
		return m;
	});
	return changed ? next : current;
};

/** The highest `seq` among the other side's messages up to and including index `upTo` of the list (all of it by default); undefined when there is none. */
export const newestFromOthers = (messages: readonly MessageDto[], me: string, upTo = messages.length - 1): number | undefined => {
	let hi: number | undefined;
	for (let i = 0; i <= upTo && i < messages.length; i++) {
		const m = messages[i]!;
		if (m.senderId !== me && (hi === undefined || m.seq > hi)) hi = m.seq;
	}
	return hi;
};

/** "10:05 AM" for today, "Yesterday 10:05 AM" or "Mon, Oct 12, 10:05 AM" otherwise. */
export const formatReceiptTime = (iso: string, now: Date = new Date()) => {
	const d = new Date(iso);
	const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
	const day = dayLabel(iso, now);
	return day === 'Today' ? time : `${day} ${time}`;
};

/** The receipt under one of my own messages: "Seen 10:05 AM" once the other side read it, "Delivered" until then. */
export const receiptText = (m: Pick<MessageDto, 'readAt'>, now?: Date) => (m.readAt ? `Seen ${formatReceiptTime(m.readAt, now)}` : 'Delivered');

/**
 * Which of my messages show their receipt: the last of each run of my consecutive messages, and any earlier one in the
 * run whose state (read or not) differs from the next. The data is per message either way.
 */
export const receiptIds = (messages: readonly MessageDto[], me: string): ReadonlySet<string> => {
	const ids = new Set<string>();
	messages.forEach((m, i) => {
		if (m.senderId !== me) return;
		const next = messages[i + 1];
		if (!next || next.senderId !== me || !!next.readAt !== !!m.readAt) ids.add(m.id);
	});
	return ids;
};
