import { migrate } from './migrate';

const url = process.env.DATABASE_URL;
if (!url) {
	console.error('DATABASE_URL is not set');
	process.exit(1);
}
try {
	const { applied, alreadyApplied } = await migrate(url, { log: (m) => console.log(m) });
	console.log(applied.length === 0 ? `up to date (${alreadyApplied} applied)` : `applied ${applied.length}, ${alreadyApplied} were already applied`);
} catch (e) {
	console.error(e instanceof Error ? e.message : e);
	process.exit(1);
}
