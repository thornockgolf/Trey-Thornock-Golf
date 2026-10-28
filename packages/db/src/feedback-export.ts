/**
 * TEMPORARY dev tool: print the feedback tickets as Markdown for a coding agent (same text as GET /api/feedback/export).
 *
 *   bun run feedback:export                 open tickets
 *   bun run feedback:export -- --status all (open | in_progress | done | wont_do | all)
 */
import { formatFeedbackMarkdown, parseExportStatus } from '@ttg/shared';
import { Effect } from 'effect';
import { Db } from './db';
import { Feedback } from './feedback';

const url = process.env.DATABASE_URL;
if (!url) {
	console.error('DATABASE_URL is not set');
	process.exit(1);
}
const i = process.argv.indexOf('--status');
const status = parseExportStatus(i >= 0 ? process.argv[i + 1] : undefined);

const program = Effect.gen(function* () {
	const tickets = yield* (yield* Feedback).listForExport(status);
	process.stdout.write(formatFeedbackMarkdown(tickets, { status, generatedAt: new Date() }));
});

await Effect.runPromise(program.pipe(Effect.provide(Feedback.layer), Effect.provide(Db.layerFromUrl(url, { max: 1 })), Effect.scoped)).catch((e) => {
	console.error(e instanceof Error ? e.message : e);
	process.exit(1);
});
process.exit(0);
