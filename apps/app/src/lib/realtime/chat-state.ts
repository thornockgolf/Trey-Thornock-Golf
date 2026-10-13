import type { MessageDto } from '@ttg/shared';

/**
 * Merge messages into a thread: one entry per id (a message that arrives by push and again by
 * catch-up appears once), ordered by `seq`. Returns the same array when nothing changed.
 */
export const mergeMessages = (current: readonly MessageDto[], incoming: readonly MessageDto[]): readonly MessageDto[] => {
	const byId = new Map(current.map((m) => [m.id, m]));
	let changed = false;
	for (const m of incoming) {
		if (!byId.has(m.id)) {
			byId.set(m.id, m);
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
