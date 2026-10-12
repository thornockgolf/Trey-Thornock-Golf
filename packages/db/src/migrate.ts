import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';

/** Where the SQL files live (packages/db/migrations). */
export const MIGRATIONS_DIR = new URL('../migrations', import.meta.url).pathname;

/** All objects live in this schema, not `public` (Supabase's REST layer exposes `public`). */
export const APP_SCHEMA = 'app';

// Arbitrary constant: serializes concurrent runners (app and worker deploying together).
const ADVISORY_LOCK_KEY = 7_265_113_001;

export interface Migration {
	version: string;
	name: string;
	sql: string;
	checksum: string;
}

export class MigrationError extends Error {
	override readonly name = 'MigrationError';
}

const FILE_RE = /^(\d{4})_([a-z0-9_]+)\.sql$/;

/** Read `NNNN_name.sql` files in version order. Anything else in the directory is an error. */
export const loadMigrations = (dir: string = MIGRATIONS_DIR): Migration[] => {
	const files = readdirSync(dir).filter((f) => !f.startsWith('.')).sort();
	const migrations = files.map((file) => {
		const m = FILE_RE.exec(file);
		if (!m) throw new MigrationError(`Unexpected file in migrations directory: ${file}`);
		const sql = readFileSync(join(dir, file), 'utf8');
		return { version: m[1]!, name: m[2]!, sql, checksum: createHash('sha256').update(sql).digest('hex') };
	});
	const versions = new Set<string>();
	for (const { version } of migrations) {
		if (versions.has(version)) throw new MigrationError(`Duplicate migration version ${version}`);
		versions.add(version);
	}
	return migrations;
};

export interface MigrateResult {
	applied: string[];
	alreadyApplied: number;
}

/**
 * Apply pending migrations, forward-only and idempotent: rerunning applies nothing. Each migration
 * runs in its own transaction with `search_path = app, public`. A migration that was already
 * applied must not have been edited (checksum check). A lock prevents two runners racing.
 */
export const migrate = async (
	connection: string | pg.ClientConfig,
	options: { dir?: string; log?: (msg: string) => void } = {}
): Promise<MigrateResult> => {
	const log = options.log ?? (() => {});
	const migrations = loadMigrations(options.dir);
	const client = new pg.Client(typeof connection === 'string' ? { connectionString: connection } : connection);
	await client.connect();
	try {
		await client.query('select pg_advisory_lock($1)', [ADVISORY_LOCK_KEY]);
		try {
			await client.query(`create schema if not exists ${APP_SCHEMA}`);
			await client.query(`
				create table if not exists ${APP_SCHEMA}.schema_migrations (
					version text primary key,
					name text not null,
					checksum text not null,
					applied_at timestamptz not null default now()
				)`);
			const rows = (
				await client.query<{ version: string; checksum: string }>(
					`select version, checksum from ${APP_SCHEMA}.schema_migrations`
				)
			).rows;
			const done = new Map(rows.map((r) => [r.version, r.checksum]));
			const known = new Set(migrations.map((m) => m.version));
			for (const version of done.keys()) {
				if (!known.has(version)) throw new MigrationError(`Database has migration ${version} that is not in the migrations directory`);
			}
			const applied: string[] = [];
			for (const m of migrations) {
				const recorded = done.get(m.version);
				if (recorded !== undefined) {
					if (recorded !== m.checksum) {
						throw new MigrationError(`Migration ${m.version}_${m.name} was edited after it was applied. Add a new migration instead.`);
					}
					continue;
				}
				await client.query('begin');
				try {
					await client.query(`set local search_path to ${APP_SCHEMA}, public`);
					await client.query(m.sql);
					await client.query(
						`insert into ${APP_SCHEMA}.schema_migrations (version, name, checksum) values ($1, $2, $3)`,
						[m.version, m.name, m.checksum]
					);
					await client.query('commit');
				} catch (e) {
					await client.query('rollback');
					throw new MigrationError(`Migration ${m.version}_${m.name} failed: ${e instanceof Error ? e.message : String(e)}`);
				}
				log(`applied ${m.version}_${m.name}`);
				applied.push(m.version);
			}
			return { applied, alreadyApplied: done.size };
		} finally {
			await client.query('select pg_advisory_unlock($1)', [ADVISORY_LOCK_KEY]);
		}
	} finally {
		await client.end();
	}
};
