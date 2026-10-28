import { assert, layer } from '@effect/vitest';
import { formatFeedbackMarkdown } from '@ttg/shared';
import { Effect, Layer } from 'effect';
import { Db } from './db';
import { Feedback } from './feedback';
import { TestDb } from './testing';
import { Users } from './users';

const Live = Layer.mergeAll(Users.layer, Feedback.layer).pipe(Layer.provideMerge(TestDb));

layer(Live, { timeout: 60_000 })('Feedback', (it) => {
	const people = (tag: string) =>
		Effect.gen(function* () {
			const users = yield* Users;
			return {
				coach: yield* users.ensure({ clerkUserId: `${tag}_c`, role: 'coach' }),
				player: yield* users.ensure({ clerkUserId: `${tag}_p`, role: 'player' }),
				other: yield* users.ensure({ clerkUserId: `${tag}_o`, role: 'player' }),
				feedback: yield* Feedback
			};
		});

	it.effect('creates with defaults and context, lists newest first, and scopes by author, status and type', () =>
		Effect.gen(function* () {
			const { coach, player, other, feedback } = yield* people('fb1');
			const a = yield* feedback.create({ authorId: player.id, authorRole: 'player', title: ' Bigger button ', body: 'Hard to tap', type: 'change', pagePath: '/plans?x=1', viewport: '390x844', userAgent: 'UA' });
			assert.deepInclude(a, { title: 'Bigger button', status: 'open', priority: 'normal', authorRole: 'player', pagePath: '/plans?x=1', viewport: '390x844', resolutionNotes: null });
			const b = yield* feedback.create({ authorId: coach.id, authorRole: 'coach', title: 'Crash', body: 'Boom', type: 'bug', priority: 'high' });
			yield* feedback.create({ authorId: other.id, authorRole: 'player', title: 'Idea', body: 'Hmm', type: 'idea' });

			assert.deepStrictEqual((yield* feedback.list({ authorId: player.id })).map((t) => t.id), [a.id]);
			assert.deepStrictEqual((yield* feedback.list({ authorId: other.id })).length, 1);
			const all = yield* feedback.list({});
			assert.isTrue(all.length >= 3);
			assert.isTrue(all.every((t, i) => i === 0 || all[i - 1]!.createdAt >= t.createdAt));
			assert.deepStrictEqual((yield* feedback.list({ type: 'bug', authorId: coach.id })).map((t) => t.id), [b.id]);
			assert.deepStrictEqual((yield* feedback.list({ status: 'done', authorId: player.id })), []);
			assert.strictEqual((yield* feedback.get(a.id))!.id, a.id);
			assert.isUndefined(yield* feedback.get('00000000-0000-4000-8000-000000000000'));
		})
	);

	it.effect('updates only the fields given, sets and clears notes', () =>
		Effect.gen(function* () {
			const { player, feedback } = yield* people('fb2');
			const t = yield* feedback.create({ authorId: player.id, authorRole: 'player', title: 'T', body: 'B', type: 'bug' });
			const s = (yield* feedback.update(t.id, { status: 'in_progress' }))!;
			assert.deepInclude(s, { status: 'in_progress', title: 'T', body: 'B' });
			const n = (yield* feedback.update(t.id, { resolutionNotes: 'Fixed in X', status: 'done' }))!;
			assert.deepInclude(n, { resolutionNotes: 'Fixed in X', status: 'done' });
			const e = (yield* feedback.update(t.id, { title: 'T2', priority: 'low' }))!;
			assert.deepInclude(e, { title: 'T2', priority: 'low', resolutionNotes: 'Fixed in X' });
			assert.isNull((yield* feedback.update(t.id, { resolutionNotes: '' }))!.resolutionNotes);
			assert.isUndefined(yield* feedback.update('00000000-0000-4000-8000-000000000000', { status: 'done' }));
		})
	);

	it.effect('enforces the enum and length checks', () =>
		Effect.gen(function* () {
			const { player, feedback } = yield* people('fb3');
			const db = yield* Db;
			const bad = (sql: string) => db.query(sql, [player.id]).pipe(Effect.flip, Effect.map(() => true));
			assert.isTrue(yield* bad(`insert into feedback_tickets (author_id, author_role, title, body, type) values ($1, 'player', '', 'b', 'bug')`));
			assert.isTrue(yield* bad(`insert into feedback_tickets (author_id, author_role, title, body, type) values ($1, 'admin', 't', 'b', 'bug')`));
			assert.isTrue(yield* bad(`insert into feedback_tickets (author_id, author_role, title, body, type) values ($1, 'player', 't', 'b', 'rant')`));
			assert.isTrue(yield* bad(`insert into feedback_tickets (author_id, author_role, title, body, type, status) values ($1, 'player', 't', 'b', 'bug', 'closed')`));
			yield* feedback.create({ authorId: player.id, authorRole: 'player', title: 'ok', body: 'ok', type: 'bug' });
		})
	);

	it.effect('exports by status, oldest first, as Markdown the formatter accepts', () =>
		Effect.gen(function* () {
			const { player, feedback } = yield* people('fb4');
			const open = yield* feedback.create({ authorId: player.id, authorRole: 'player', title: 'Open one', body: 'Body', type: 'change', pagePath: '/profile' });
			const done = yield* feedback.create({ authorId: player.id, authorRole: 'player', title: 'Done one', body: 'Body', type: 'bug' });
			yield* feedback.update(done.id, { status: 'done', resolutionNotes: 'Did it' });
			const openList = yield* feedback.listForExport('open');
			assert.isTrue(openList.some((t) => t.id === open.id));
			assert.isFalse(openList.some((t) => t.id === done.id));
			const all = yield* feedback.listForExport('all');
			assert.isTrue(all.some((t) => t.id === done.id) && all.some((t) => t.id === open.id));
			const md = formatFeedbackMarkdown(all.filter((t) => [open.id, done.id].includes(t.id)), { status: 'all', generatedAt: new Date('2026-10-28T00:00:00Z') });
			assert.include(md, 'Open one');
			assert.include(md, 'Did it');
			assert.include(md, '- Page: `/profile`');
		})
	);
});
