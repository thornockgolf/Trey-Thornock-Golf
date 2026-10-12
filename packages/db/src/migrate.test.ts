import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadMigrations, migrate, MigrationError } from './migrate';
import { createTempDatabase } from './test-db';

let db: Awaited<ReturnType<typeof createTempDatabase>>;
const query = async <T extends pg.QueryResultRow>(sql: string, params: unknown[] = []) => {
	const c = new pg.Client({ connectionString: db.url });
	await c.connect();
	try {
		return (await c.query<T>(sql, params)).rows;
	} finally {
		await c.end();
	}
};

beforeAll(async () => {
	db = await createTempDatabase();
});
afterAll(async () => {
	await db?.drop();
});

describe('migrations from empty', () => {
	it('applies every migration, then is a no-op on rerun', async () => {
		const all = loadMigrations();
		const first = await migrate(db.url);
		expect(first.applied).toEqual(all.map((m) => m.version));
		const second = await migrate(db.url);
		expect(second.applied).toEqual([]);
		expect(second.alreadyApplied).toBe(all.length);
	});

	it('creates all spec tables in the app schema and nothing in public', async () => {
		const tables = (
			await query<{ table_name: string }>(
				`select table_name from information_schema.tables where table_schema = 'app' and table_type = 'BASE TABLE'`
			)
		).map((r) => r.table_name);
		for (const t of [
			'users', 'player_profiles', 'coach_assignments', 'coach_notes', 'videos', 'analyses',
			'analysis_segments', 'annotations', 'conversations', 'messages', 'notifications',
			'subscriptions', 'payments', 'stripe_events', 'questionnaire_responses', 'drills',
			'practice_plans', 'plan_assignments', 'plan_sessions', 'check_ins', 'assessments',
			'assessment_results', 'schema_migrations'
		]) {
			expect(tables).toContain(t);
		}
		const inPublic = await query(`select 1 from information_schema.tables where table_schema = 'public' and table_name = 'users'`);
		expect(inPublic).toHaveLength(0);
	});

	it('creates the indexes the spec names', async () => {
		const idx = (await query<{ indexname: string }>(`select indexname from pg_indexes where schemaname = 'app'`)).map((r) => r.indexname);
		for (const i of [
			'videos_owner_id_created_at_idx', 'annotations_video_id_start_ms_idx', 'analysis_segments_analysis_id_position_idx',
			'plan_sessions_assignment_id_scheduled_on_idx', 'check_ins_player_id_scheduled_on_idx',
			'messages_conversation_id_created_at_idx', 'notifications_user_id_read_at_idx'
		]) {
			expect(idx).toContain(i);
		}
	});

	it('keeps updated_at current via the trigger', async () => {
		const [u] = await query<{ id: string }>(`insert into app.users (clerk_user_id) values ('user_trig') returning id`);
		const [before] = await query<{ updated_at: Date }>(`select updated_at from app.users where id = $1`, [u!.id]);
		await new Promise((r) => setTimeout(r, 20));
		await query(`update app.users set display_name = 'x' where id = $1`, [u!.id]);
		const [after] = await query<{ updated_at: Date }>(`select updated_at from app.users where id = $1`, [u!.id]);
		expect(after!.updated_at.getTime()).toBeGreaterThan(before!.updated_at.getTime());
	});
});

describe('constraints', () => {
	const mkUser = async (clerk: string, role = 'player') =>
		(await query<{ id: string }>(`insert into app.users (clerk_user_id, role) values ($1, $2) returning id`, [clerk, role]))[0]!.id;

	it('blocks deleting a user who owns a video (RESTRICT)', async () => {
		const owner = await mkUser('user_owner');
		await query(`insert into app.videos (owner_id, kind) values ($1, 'swing')`, [owner]);
		await expect(query(`delete from app.users where id = $1`, [owner])).rejects.toThrow(/violates foreign key/);
	});

	it('rejects bad enum values and duplicate clerk ids', async () => {
		await expect(mkUser('user_badrole', 'admin')).rejects.toThrow(/check constraint/);
		await mkUser('user_dup');
		await expect(mkUser('user_dup')).rejects.toThrow(/duplicate key/);
	});

	it('requires an annotation to belong to exactly one of video or analysis', async () => {
		const owner = await mkUser('user_ann_owner');
		const coach = await mkUser('user_ann_coach', 'coach');
		const [v] = await query<{ id: string }>(`insert into app.videos (owner_id, kind) values ($1, 'swing') returning id`, [owner]);
		const shape = JSON.stringify({ type: 'line', points: [[0, 0], [1, 1]] });
		await expect(
			query(`insert into app.annotations (author_id, start_ms, end_ms, shape) values ($1, 0, 10, $2)`, [coach, shape])
		).rejects.toThrow(/check constraint/);
		await query(`insert into app.annotations (video_id, author_id, start_ms, end_ms, shape) values ($1, $2, 0, 10, $3)`, [v!.id, coach, shape]);
		await expect(
			query(`insert into app.annotations (video_id, author_id, start_ms, end_ms, shape) values ($1, $2, 50, 10, $3)`, [v!.id, coach, shape])
		).rejects.toThrow(/check constraint/);
	});

	it('allows only one live segment per position but keeps replaced ones', async () => {
		const owner = await mkUser('user_seg_owner');
		const coach = await mkUser('user_seg_coach', 'coach');
		const [v] = await query<{ id: string }>(`insert into app.videos (owner_id, kind) values ($1, 'swing') returning id`, [owner]);
		const [a] = await query<{ id: string }>(`insert into app.analyses (video_id, coach_id) values ($1, $2) returning id`, [v!.id, coach]);
		const seg = `insert into app.analysis_segments (analysis_id, position, start_ms, end_ms) values ($1, 0, 0, 1000)`;
		await query(seg, [a!.id]);
		await expect(query(seg, [a!.id])).rejects.toThrow(/duplicate key/);
		await query(`update app.analysis_segments set replaced_at = now() where analysis_id = $1`, [a!.id]);
		await query(seg, [a!.id]);
		const rows = await query(`select 1 from app.analysis_segments where analysis_id = $1`, [a!.id]);
		expect(rows).toHaveLength(2);
	});

	it('enforces unique coach/player pairs and no self-assignment', async () => {
		const coach = await mkUser('user_pair_coach', 'coach');
		const player = await mkUser('user_pair_player');
		const ins = `insert into app.coach_assignments (coach_id, player_id) values ($1, $2)`;
		await query(ins, [coach, player]);
		await expect(query(ins, [coach, player])).rejects.toThrow(/duplicate key/);
		await expect(query(ins, [coach, coach])).rejects.toThrow(/check constraint/);
	});

	it('requires a video for a video timestamp on a message', async () => {
		const coach = await mkUser('user_msg_coach', 'coach');
		const player = await mkUser('user_msg_player');
		const [c] = await query<{ id: string }>(`insert into app.conversations (coach_id, player_id) values ($1, $2) returning id`, [coach, player]);
		await expect(
			query(`insert into app.messages (conversation_id, sender_id, body, video_ms) values ($1, $2, 'hi', 500)`, [c!.id, coach])
		).rejects.toThrow(/check constraint/);
	});
});

describe('runner safety', () => {
	const tmpDir = (files: Record<string, string>) => {
		const dir = mkdtempSync(join(tmpdir(), 'ttg-mig-'));
		for (const [name, sql] of Object.entries(files)) writeFileSync(join(dir, name), sql);
		return dir;
	};

	it('rolls back a failing migration and records nothing for it', async () => {
		const own = await createTempDatabase();
		try {
			const dir = tmpDir({
				'0001_ok.sql': 'create table a (id int);',
				'0002_bad.sql': 'create table b (id int); select * from does_not_exist;'
			});
			await expect(migrate(own.url, { dir })).rejects.toThrow(/0002_bad failed/);
			const c = new pg.Client({ connectionString: own.url });
			await c.connect();
			const { rows } = await c.query(`select version from app.schema_migrations`);
			const b = await c.query(`select 1 from information_schema.tables where table_schema = 'app' and table_name = 'b'`);
			await c.end();
			expect(rows.map((r) => r.version)).toEqual(['0001']);
			expect(b.rowCount).toBe(0);
		} finally {
			await own.drop();
		}
	});

	it('refuses to run when an applied migration was edited', async () => {
		const own = await createTempDatabase();
		try {
			const dir = tmpDir({ '0001_x.sql': 'create table x (id int);' });
			await migrate(own.url, { dir });
			writeFileSync(join(dir, '0001_x.sql'), 'create table x (id int, extra int);');
			await expect(migrate(own.url, { dir })).rejects.toThrow(MigrationError);
			await expect(migrate(own.url, { dir })).rejects.toThrow(/edited after it was applied/);
		} finally {
			await own.drop();
		}
	});

	it('rejects stray files and duplicate versions', () => {
		expect(() => loadMigrations(tmpDir({ 'notes.txt': '' }))).toThrow(/Unexpected file/);
		expect(() => loadMigrations(tmpDir({ '0001_a.sql': '', '0001_b.sql': '' }))).toThrow(/Duplicate/);
	});

	it('serializes concurrent runners', async () => {
		const own = await createTempDatabase();
		try {
			const results = await Promise.all([migrate(own.url), migrate(own.url), migrate(own.url)]);
			const total = results.reduce((n, r) => n + r.applied.length, 0);
			expect(total).toBe(loadMigrations().length);
		} finally {
			await own.drop();
		}
	});
});
