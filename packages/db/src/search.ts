import { SEARCH_PER_CATEGORY, SEARCH_KINDS, excerpt, likePattern, playerLabel, type SearchKind, type SearchResultDto } from '@ttg/shared';
import { Context, Effect, Layer } from 'effect';
import { Db } from './db';
import type { DatabaseError } from './errors';

export interface SearchGroup {
	readonly kind: SearchKind;
	readonly results: readonly SearchResultDto[];
	/** More matched than `results` holds. */
	readonly more: boolean;
}

const WORD_SIMILARITY = '0.4';

const dateLabel = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

type Row = Record<string, any>;

/**
 * The coach's global search. Everything is scoped to `coachId`: their conversations, notes and plans, videos of players
 * they are coaching, and the reference library. pg_trgm gives typo tolerance (word similarity) on top of plain ILIKE;
 * queries under 3 characters use ILIKE only, since a trigram needs three.
 */
export class Search extends Context.Service<
	Search,
	{
		readonly run: (coachId: string, q: string) => Effect.Effect<readonly SearchGroup[], DatabaseError>;
	}
>()('ttg/db/Search') {
	static readonly layer = Layer.effect(
		Search,
		Effect.gen(function* () {
			const db = yield* Db;
			return Search.of({
				run: (coachId, q) =>
					db.transaction((tx) =>
						Effect.gen(function* () {
							// pg_trgm may live in `public` or in Supabase's `extensions` schema
							yield* tx.query(`select set_config('search_path', 'app, public, extensions', true), set_config('pg_trgm.word_similarity_threshold', '${WORD_SIMILARITY}', true)`);
							const take = SEARCH_PER_CATEGORY + 1;
							// $1 text, $2 ILIKE pattern, $3 coach, $4 fuzzy allowed, $5 limit. Every query uses all five (Postgres cannot type an unused
							// parameter), hence the `$3::uuid is not null` no-ops in the ones that are not coach-scoped.
							const args = [q, likePattern(q), coachId, q.length >= 3, take];
							const hit = (col: string) => `(${col} ilike $2 or ($4 and $1 <% ${col}))`;
							const score = (col: string) => `greatest(case when ${col} ilike $2 then 1.0 else 0 end, case when $4 then word_similarity($1, ${col}) else 0 end)`;
							const find = (sql: string) => tx.query<Row>(sql, args);

							const players = yield* find(
								`select u.id, u.display_name, u.email, greatest(${score('coalesce(u.display_name, \'\')')}, ${score('coalesce(u.email, \'\')')}) as score
								 from users u
								 where $3::uuid is not null and u.role = 'player' and u.deletion_requested_at is null and u.deleted_at is null
								   and (${hit("coalesce(u.display_name, '')")} or ${hit("coalesce(u.email, '')")})
								 order by score desc, u.display_name limit $5`
							);
							const videos = yield* find(
								`select v.id, v.title, v.created_at, o.id as owner_id, o.display_name, o.email, ${score('v.title')} as score
								 from videos v join users o on o.id = v.owner_id
								 where v.kind = 'swing' and v.status <> 'pending' and v.title is not null and ${hit('v.title')}
								   and exists (select 1 from coach_assignments ca where ca.coach_id = $3 and ca.player_id = v.owner_id and ca.status = 'active')
								 order by score desc, v.created_at desc limit $5`
							);
							const references = yield* find(
								`select v.id, v.title, v.created_at, ${score('v.title')} as score
								 from videos v
								 where $3::uuid is not null and v.kind = 'reference' and v.status <> 'pending' and v.title is not null and ${hit('v.title')}
								 order by score desc, v.created_at desc limit $5`
							);
							const messages = yield* find(
								`select m.id, m.body, m.video_id, m.created_at, c.id as conversation_id, p.id as player_id, p.display_name, p.email, vt.title as video_title, ${score('m.body')} as score
								 from messages m
								 join conversations c on c.id = m.conversation_id and c.coach_id = $3
								 join users p on p.id = c.player_id and p.deleted_at is null
								 left join videos vt on vt.id = m.video_id
								 where ${hit('m.body')}
								 order by score desc, m.seq desc limit $5`
							);
							const plans = yield* find(
								`select pl.id, pl.title, pl.created_at, ${score('pl.title')} as score
								 from practice_plans pl
								 where pl.author_id = $3 and ${hit('pl.title')}
								 order by score desc, pl.created_at desc limit $5`
							);
							const drills = yield* find(
								`select d.id, d.name, d.category, d.purpose, d.cues,
								   greatest(${score('d.name')}, ${score("coalesce(d.purpose, '')")} * 0.8, ${score("coalesce(d.cues, '')")} * 0.8) as score
								 from drills d
								 where $3::uuid is not null and (${hit('d.name')} or ${hit("coalesce(d.purpose, '')")} or ${hit("coalesce(d.cues, '')")})
								 order by score desc, d.name limit $5`
							);
							const notes = yield* find(
								`select n.id, n.body, n.created_at, p.id as player_id, p.display_name, p.email, ${score('n.body')} as score
								 from coach_notes n
								 join coach_assignments a on a.id = n.assignment_id and a.coach_id = $3 and a.status = 'active'
								 join users p on p.id = a.player_id and p.deleted_at is null
								 where ${hit('n.body')}
								 order by score desc, n.created_at desc limit $5`
							);

							const person = (r: Row) => playerLabel({ id: r.player_id ?? r.owner_id ?? r.id, displayName: r.display_name, email: r.email });
							const cap = (kind: SearchKind, rows: Row[], map: (r: Row) => SearchResultDto): SearchGroup => ({
								kind,
								results: rows.slice(0, SEARCH_PER_CATEGORY).map(map),
								more: rows.length > SEARCH_PER_CATEGORY
							});
							const groups: Record<SearchKind, SearchGroup> = {
								player: cap('player', players as Row[], (r) => ({
									kind: 'player',
									id: r.id,
									title: playerLabel({ id: r.id, displayName: r.display_name, email: r.email }),
									subtitle: r.display_name && r.email ? r.email : null,
									snippet: null,
									href: `/coach/players/${r.id}`
								})),
								video: cap('video', videos as Row[], (r) => ({
									kind: 'video',
									id: r.id,
									title: r.title,
									subtitle: `${person({ owner_id: r.owner_id, display_name: r.display_name, email: r.email })} · ${dateLabel(r.created_at)}`,
									snippet: null,
									href: `/videos/${r.id}`
								})),
								reference: cap('reference', references as Row[], (r) => ({
									kind: 'reference',
									id: r.id,
									title: r.title,
									subtitle: dateLabel(r.created_at),
									snippet: null,
									href: `/videos/${r.id}`
								})),
								message: cap('message', messages as Row[], (r) => ({
									kind: 'message',
									id: r.id,
									title: person(r),
									subtitle: r.video_id ? `In video: ${r.video_title ?? 'Untitled'}` : 'Messages',
									snippet: excerpt(r.body, q),
									href: r.video_id ? `/videos/${r.video_id}` : `/messages/${r.conversation_id}`
								})),
								plan: cap('plan', plans as Row[], (r) => ({ kind: 'plan', id: r.id, title: r.title, subtitle: null, snippet: null, href: `/coach/plans?plan=${r.id}` })),
								drill: cap('drill', drills as Row[], (r) => ({
									kind: 'drill',
									id: r.id,
									title: r.name,
									subtitle: r.category ?? null,
									snippet: r.name.toLowerCase().includes(q.toLowerCase()) ? null : excerpt([r.purpose, r.cues].filter(Boolean).join(' · '), q) || null,
									href: `/coach/plans?drill=${r.id}`
								})),
								note: cap('note', notes as Row[], (r) => ({
									kind: 'note',
									id: r.id,
									title: person(r),
									subtitle: `Private note · ${dateLabel(r.created_at)}`,
									snippet: excerpt(r.body, q),
									href: `/coach/players/${r.player_id}`
								}))
							};
							return SEARCH_KINDS.map((k) => groups[k]).filter((g) => g.results.length > 0);
						})
					)
			});
		})
	);
}
