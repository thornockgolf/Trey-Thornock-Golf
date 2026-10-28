/**
 * Seeds the 90-day development plan (`plan-90day.ts`). Idempotent: new drills are skipped when a drill with that name
 * exists, the plan is skipped when the coach already has one with the same title, and a player who already has this
 * plan assigned is left alone.
 *
 *   bun run db:seed-plan                          coach: first coach user; assigns to the user named "Test Player" (if any), starting today
 *   bun run db:seed-plan --coach <uuid> --player <uuid> --start 2026-11-02
 *   bun run db:seed-plan --no-assign              plan and drills only
 *
 * Sessions land three a week (days 0, 2, 4 of each week from the start date), so lesson 14 is day 31 and lesson 27 day 61.
 */
import { addDays, drillIdsOf, phaseIssues, sessionTotalIssues } from '@ttg/shared';
import { Effect } from 'effect';
import { Db } from './db';
import { Drills, Plans } from './plans';
import { NEW_DRILLS, PLAN_TITLE, SEEDED_DRILL_NAMES, buildStructure, sessionDates } from './plan-90day';

const arg = (name: string) => {
	const i = process.argv.indexOf(`--${name}`);
	return i >= 0 ? process.argv[i + 1] : undefined;
};
const flag = (name: string) => process.argv.includes(`--${name}`);

const url = process.env.DATABASE_URL;
if (!url) {
	console.error('DATABASE_URL is not set');
	process.exit(1);
}
const startsOn = arg('start') ?? new Date().toISOString().slice(0, 10);

const program = Effect.gen(function* () {
	const db = yield* Db;
	const drills = yield* Drills;
	const plans = yield* Plans;

	const coachId =
		arg('coach') ?? (yield* db.maybeOne<{ id: string }>(`select id from users where role = 'coach' and deleted_at is null order by created_at limit 1`))?.id;
	if (!coachId) return console.error('No coach user found. Pass --coach <uuid>.');

	// Drills: skip by name.
	let added = 0;
	for (const d of NEW_DRILLS) {
		const result = yield* drills.create({ ...d, steps: [...d.steps] });
		if (result._tag === 'Saved') added++;
	}
	console.log(`drills: ${added} added, ${NEW_DRILLS.length - added} already existed`);

	const library = yield* drills.list();
	const idByName = new Map(library.map((d) => [d.name, d.id]));
	const missing = [...SEEDED_DRILL_NAMES].filter((n) => !idByName.has(n));
	if (missing.length > 0) return console.error(`Missing seeded drills (run bun run db:migrate): ${missing.join(', ')}`);

	const structure = buildStructure(idByName);
	const problems = [...phaseIssues(structure), ...sessionTotalIssues(structure).map((t) => `"${t.title}" is ${t.actual} min, needs ${t.expected}`)];
	if (problems.length > 0) return console.error(`Plan is invalid: ${problems.join('; ')}`);
	const found = (yield* drills.existing(drillIdsOf(structure))).size;
	if (found !== drillIdsOf(structure).length) return console.error('Plan uses a drill that does not exist');

	// Plan: skip by (author, title).
	const existing = (yield* plans.list()).find((p) => p.authorId === coachId && p.title === PLAN_TITLE);
	const plan = existing ?? (yield* plans.create({ authorId: coachId, title: PLAN_TITLE, structure }));
	console.log(`plan: ${existing ? 'already exists' : 'created'} (${plan.id})`);
	if (flag('no-assign')) return;

	// Assign.
	const playerId =
		arg('player') ?? (yield* db.maybeOne<{ id: string }>(`select id from users where role = 'player' and display_name = 'Test Player' and deleted_at is null limit 1`))?.id;
	if (!playerId) return console.log('assign: no player given and no "Test Player" found, skipped');
	const already = yield* db.maybeOne(`select 1 as ok from plan_assignments where plan_id = $1 and player_id = $2 and status = 'active'`, [plan.id, playerId]);
	if (already) return console.log('assign: player already has this plan, skipped');
	const dates = sessionDates(startsOn, addDays);
	if (!dates) return console.error(`--start must be a real YYYY-MM-DD date, got "${startsOn}"`);
	const result = yield* plans.assign({ planId: plan.id, coachId, playerId, startsOn, dates });
	console.log(result._tag === 'Assigned' ? `assign: ${result.assignment.sessions.length} sessions from ${startsOn} to ${dates.at(-1)}` : `assign: ${result._tag} (is the coach paired with the player?)`);
});

await Effect.runPromise(
	program.pipe(Effect.provide(Plans.layer), Effect.provide(Drills.layer), Effect.provide(Db.layerFromUrl(url, { max: 2 })), Effect.scoped)
).catch((e) => {
	console.error(e instanceof Error ? e.message : e);
	process.exit(1);
});
