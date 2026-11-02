/**
 * Dev-only stand-in for `GET /api/search` (the coach's global search). Matches the real response shape; matching is the
 * shared `markRanges` (substring or one or two typos). Try `?q=boom` for a 500 and `?q=slow` for a 2 s delay.
 */
import { dev } from '$app/env';
import { error, json } from '@sveltejs/kit';
import { SEARCH_KINDS, SEARCH_LABELS, SEARCH_PER_CATEGORY, cleanQuery, excerpt, markRanges, type SearchResultDto } from '@ttg/shared';

const P1 = '00000000-0000-4000-8000-0000000000a1';
const P2 = '00000000-0000-4000-8000-0000000000a2';
const r = (kind: SearchResultDto['kind'], n: number, title: string, subtitle: string | null, href: string, snippet: string | null = null): SearchResultDto => ({
	kind,
	id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
	title,
	subtitle,
	snippet,
	href
});
const LONG = 'Thanks for the lesson today. I think my transition tempo is still rushed on the way down, especially with the driver. Can you look at the clip from the range and tell me if the slice is coming from my grip or my path? Talk soon.';

const DATA: SearchResultDto[] = [
	r('player', 1, 'Sam Rivera', 'sam.rivera@example.com', `/coach/players/${P1}`),
	r('player', 2, 'Jonathan Slice-Parker', 'jon@example.com', `/coach/players/${P2}`),
	r('video', 3, 'Driver slice at the range', 'Sam Rivera · Oct 28, 2026', '/videos/00000000-0000-4000-8000-000000000003'),
	r('video', 4, 'Iron tempo, 7 iron', 'Jonathan Slice-Parker · Oct 21, 2026', '/videos/00000000-0000-4000-8000-000000000004'),
	r('reference', 5, 'Tour pro driver tempo, face on', 'Oct 2, 2026', '/videos/00000000-0000-4000-8000-000000000005'),
	r('message', 6, 'Sam Rivera', 'Messages', '/messages/00000000-0000-4000-8000-0000000000c1', excerpt(LONG, 'tempo')),
	r('message', 7, 'Jonathan Slice-Parker', 'In video: Iron tempo, 7 iron', '/videos/00000000-0000-4000-8000-000000000004', 'Is the tempo better in this one?'),
	r('plan', 8, '12-week full swing rebuild', null, '/coach/plans?plan=00000000-0000-4000-8000-000000000008'),
	r('drill', 9, 'Pump drill', 'Full swing', '/coach/plans?drill=00000000-0000-4000-8000-000000000009', 'Feel the transition; slow tempo, stop at the top.'),
	r('drill', 10, 'Gate putting drill', 'Putting', '/coach/plans?drill=00000000-0000-4000-8000-000000000010'),
	r('note', 11, 'Sam Rivera', 'Private note · Oct 24, 2026', `/coach/players/${P1}`, 'Grip is weak, fix before tempo work. Slice follows from the open face.')
];
// a second page of plans so a category can overflow
const MANY = Array.from({ length: 7 }, (_, i) => r('plan', 100 + i, `Short game block ${i + 1}`, null, `/coach/plans?plan=00000000-0000-4000-8000-0000000001${i}0`));

export const searchHandle = async (method: string, path: string, url: URL) => {
	if (!dev) error(404, 'Not found');
	if (method !== 'GET' || path !== 'search') return undefined;
	const q = cleanQuery(url.searchParams.get('q'));
	if (!q) return json({ code: 'validation', message: 'Search needs 2 to 80 characters' }, { status: 422 });
	if (q === 'boom') return json({ code: 'internal', message: 'Something went wrong' }, { status: 500 });
	if (q === 'slow') await new Promise((ok) => setTimeout(ok, 2000));
	const hits = [...DATA, ...MANY].filter((d) => markRanges(`${d.title} ${d.snippet ?? ''}`, q).length > 0);
	const categories = SEARCH_KINDS.flatMap((kind) => {
		const mine = hits.filter((h) => h.kind === kind);
		return mine.length ? [{ kind, label: SEARCH_LABELS[kind], results: mine.slice(0, SEARCH_PER_CATEGORY), more: mine.length > SEARCH_PER_CATEGORY }] : [];
	});
	return json({ q, categories });
};
