/** "just now", "5 min ago", "3 h ago", "Yesterday", else a short date. */
export const timeAgo = (iso: string, now: Date = new Date()) => {
	const then = new Date(iso);
	const s = Math.max(0, Math.round((now.getTime() - then.getTime()) / 1000));
	if (s < 45) return 'just now';
	if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min ago`;
	if (s < 86_400) return `${Math.round(s / 3600)} h ago`;
	if (s < 2 * 86_400) return 'Yesterday';
	return then.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};
