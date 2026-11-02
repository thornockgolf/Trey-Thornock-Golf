/** The coach's global search (`GET /api/search?q=`): shapes, query rules, and the match highlighting both sides use. */

export const SEARCH_MIN_LENGTH = 2;
export const SEARCH_MAX_LENGTH = 80;
/** Results shown per category; the server fetches one extra to know whether there are more. */
export const SEARCH_PER_CATEGORY = 5;
/** Debounce for typing, ms. */
export const SEARCH_DEBOUNCE_MS = 250;

export const SEARCH_KINDS = ['player', 'video', 'reference', 'message', 'plan', 'drill', 'note'] as const;
export type SearchKind = (typeof SEARCH_KINDS)[number];

/** Category headings, in the order the panel shows them. */
export const SEARCH_LABELS: Record<SearchKind, string> = {
	player: 'Players',
	video: 'Videos',
	reference: 'Reference library',
	message: 'Messages',
	plan: 'Plans',
	drill: 'Drills',
	note: 'Private notes'
};

export interface SearchResultDto {
	readonly kind: SearchKind;
	readonly id: string;
	readonly title: string;
	readonly subtitle: string | null;
	/** The matching line of a message, note or drill, already trimmed around the match (plain text; highlight with `markRanges`). */
	readonly snippet: string | null;
	/** Where selecting the result goes. */
	readonly href: string;
}

export interface SearchCategoryDto {
	readonly kind: SearchKind;
	readonly label: string;
	readonly results: readonly SearchResultDto[];
	/** There were more matches than shown; refine the search. */
	readonly more: boolean;
}

export interface SearchResponse {
	readonly q: string;
	/** Only categories with at least one match, in panel order. */
	readonly categories: readonly SearchCategoryDto[];
}

/** Trim and collapse whitespace; undefined when the result is outside the length limits. */
export const cleanQuery = (raw: string | null | undefined): string | undefined => {
	const q = (raw ?? '').replace(/\s+/g, ' ').trim();
	return q.length >= SEARCH_MIN_LENGTH && q.length <= SEARCH_MAX_LENGTH ? q : undefined;
};

/** Escape `%`, `_` and `\` so user text is a literal in an ILIKE pattern. */
export const likePattern = (q: string) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

/** Optimal string alignment distance (a swapped pair of letters counts as one typo), cut off at `max`. */
const editDistanceWithin = (a: string, b: string, max: number): boolean => {
	if (Math.abs(a.length - b.length) > max) return false;
	const rows: number[][] = [Array.from({ length: b.length + 1 }, (_, j) => j)];
	for (let i = 1; i <= a.length; i++) {
		const row = [i];
		for (let j = 1; j <= b.length; j++) {
			let d = Math.min(rows[i - 1]![j]! + 1, row[j - 1]! + 1, rows[i - 1]![j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
			if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d = Math.min(d, rows[i - 2]![j - 2]! + 1);
			row.push(d);
		}
		rows.push(row);
	}
	return rows[a.length]![b.length]! <= max;
};

/**
 * Character ranges `[start, end)` of `text` that match the query: every case-insensitive occurrence of each word, and, for a
 * word with none, the words of `text` within one or two typos of it (so "slcie" still lights up "slice").
 */
export const markRanges = (text: string, q: string): [number, number][] => {
	const lower = text.toLowerCase();
	const ranges: [number, number][] = [];
	for (const token of q.toLowerCase().split(' ').filter((t) => t.length >= 2)) {
		let found = false;
		for (let at = lower.indexOf(token); at !== -1; at = lower.indexOf(token, at + token.length)) {
			ranges.push([at, at + token.length]);
			found = true;
		}
		if (found || token.length < 3) continue;
		const max = token.length <= 5 ? 1 : 2;
		for (const m of lower.matchAll(/[\p{L}\p{N}']+/gu)) {
			if (editDistanceWithin(token, m[0], max)) ranges.push([m.index, m.index + m[0].length]);
		}
	}
	ranges.sort((x, y) => x[0] - y[0]);
	const merged: [number, number][] = [];
	for (const r of ranges) {
		const last = merged[merged.length - 1];
		if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
		else merged.push([r[0], r[1]]);
	}
	return merged;
};

/** A short window of `text` around the first match (or its start), with "…" where it was cut. One line. */
export const excerpt = (text: string, q: string, radius = 48): string => {
	const flat = text.replace(/\s+/g, ' ').trim();
	if (flat.length <= radius * 2) return flat;
	const first = markRanges(flat, q)[0];
	const from = Math.max(0, (first ? first[0] : 0) - radius);
	const to = Math.min(flat.length, (first ? first[1] : 0) + radius);
	// snap to word edges so the cut does not land mid-word
	const start = from === 0 ? 0 : (flat.indexOf(' ', from) + 1 || from);
	const lastSpace = flat.lastIndexOf(' ', to);
	const end = to === flat.length ? to : lastSpace > start && lastSpace > (first?.[1] ?? 0) ? lastSpace : to;
	return `${start > 0 ? '…' : ''}${flat.slice(start, end)}${end < flat.length ? '…' : ''}`;
};

/** Split text into plain and matched pieces for rendering. */
export const highlightParts = (text: string, q: string): { text: string; match: boolean }[] => {
	const parts: { text: string; match: boolean }[] = [];
	let at = 0;
	for (const [s, e] of markRanges(text, q)) {
		if (s > at) parts.push({ text: text.slice(at, s), match: false });
		parts.push({ text: text.slice(s, e), match: true });
		at = e;
	}
	if (at < text.length) parts.push({ text: text.slice(at), match: false });
	return parts;
};
