import { randomBytes } from 'node:crypto';
import pg from 'pg';

/** Admin connection to the local docker Postgres (override with TEST_DATABASE_URL). */
export const ADMIN_URL = process.env.TEST_DATABASE_URL ?? 'postgres://postgres:postgres@127.0.0.1:54322/postgres';

/** Create a throwaway database and return its URL plus a cleanup function. */
export const createTempDatabase = async () => {
	const name = `ttg_test_${randomBytes(6).toString('hex')}`;
	const admin = new pg.Client({ connectionString: ADMIN_URL });
	await admin.connect();
	await admin.query(`create database ${name}`);
	await admin.end();
	const url = new URL(ADMIN_URL);
	url.pathname = `/${name}`;
	return {
		url: url.toString(),
		drop: async () => {
			const a = new pg.Client({ connectionString: ADMIN_URL });
			await a.connect();
			await a.query(`drop database if exists ${name} with (force)`);
			await a.end();
		}
	};
};
