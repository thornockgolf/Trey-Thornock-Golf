import { Search } from '@ttg/db';
import { SEARCH_LABELS, cleanQuery, type SearchResponse } from '@ttg/shared';
import { Effect } from 'effect';
import { requireRole } from './auth';
import { ValidationError } from './errors';
import { RequestContext } from './request-context';

/**
 * `GET /api/search?q=`: the coach's global search (players, videos, reference library, messages, plans, drills, private
 * notes), grouped by category. Coach only (403 players, 401 anonymous); `q` must be 2 to 80 characters.
 */
export const searchAll = Effect.gen(function* () {
	const coach = yield* requireRole('coach');
	const { event } = yield* RequestContext;
	const q = cleanQuery(event.url.searchParams.get('q'));
	if (!q) return yield* new ValidationError({ message: 'Search needs 2 to 80 characters' });
	const groups = yield* (yield* Search).run(coach.id, q);
	return {
		q,
		categories: groups.map((g) => ({ kind: g.kind, label: SEARCH_LABELS[g.kind], results: g.results, more: g.more }))
	} satisfies SearchResponse;
});
