import type { ExportStatus } from '@ttg/shared';
import { EXPORT_STALE_MINUTES } from '@ttg/shared';
import { Context, Effect, Layer } from 'effect';
import { Db } from './db';
import type { DatabaseError } from './errors';

export interface AnalysisExport {
	readonly analysisId: string;
	readonly status: ExportStatus;
	readonly outputKey: string | null;
	readonly sizeBytes: number | null;
	readonly errorCode: string | null;
	readonly requestedAt: Date;
	readonly readyAt: Date | null;
}

interface Row {
	analysis_id: string;
	status: ExportStatus;
	output_key: string | null;
	size_bytes: string | null;
	error_code: string | null;
	requested_at: Date;
	ready_at: Date | null;
}
const COLUMNS = 'analysis_id, status, output_key, size_bytes, error_code, requested_at, ready_at';
const toExport = (r: Row): AnalysisExport => ({
	analysisId: r.analysis_id,
	status: r.status,
	outputKey: r.output_key,
	sizeBytes: r.size_bytes === null ? null : Number(r.size_bytes),
	errorCode: r.error_code,
	requestedAt: r.requested_at,
	readyAt: r.ready_at
});

export class AnalysisExports extends Context.Service<
	AnalysisExports,
	{
		readonly find: (analysisId: string) => Effect.Effect<AnalysisExport | undefined, DatabaseError>;
		/**
		 * Ask for an export. `started` is true when the job should be queued now: nothing was requested yet, the last
		 * one finished or failed, or the last request is over `EXPORT_STALE_MINUTES` old. A queued or running one is
		 * left alone (`started: false`). A new request keeps the previous file until the new one replaces it.
		 */
		readonly request: (analysisId: string) => Effect.Effect<{ export: AnalysisExport; started: boolean }, DatabaseError>;
		/** Worker: `queued`/`processing` -> `processing`. Undefined when there is nothing to do (no request, or already finished). */
		readonly claim: (analysisId: string) => Effect.Effect<AnalysisExport | undefined, DatabaseError>;
		readonly markReady: (analysisId: string, out: { outputKey: string; sizeBytes: number }) => Effect.Effect<void, DatabaseError>;
		readonly markFailed: (analysisId: string, errorCode: string) => Effect.Effect<void, DatabaseError>;
	}
>()('ttg/db/AnalysisExports') {
	static readonly layer = Layer.effect(
		AnalysisExports,
		Effect.gen(function* () {
			const db = yield* Db;
			const one = (text: string, params: readonly unknown[]) => db.maybeOne<Row>(text, params).pipe(Effect.map((r) => (r ? toExport(r) : undefined)));
			const find = (analysisId: string) => one(`select ${COLUMNS} from analysis_exports where analysis_id = $1`, [analysisId]);
			return AnalysisExports.of({
				find,
				request: (analysisId) =>
					db.transaction((tx) =>
						Effect.gen(function* () {
							const existing = yield* tx.maybeOne<Row>(`select ${COLUMNS} from analysis_exports where analysis_id = $1 for update`, [analysisId]);
							const inFlight =
								existing &&
								(existing.status === 'queued' || existing.status === 'processing') &&
								existing.requested_at.getTime() > Date.now() - EXPORT_STALE_MINUTES * 60_000;
							if (existing && inFlight) return { export: toExport(existing), started: false };
							// Keep a ready file's key and size while the new one is made; they are replaced when it is ready.
							const row = yield* tx.maybeOne<Row>(
								`insert into analysis_exports (analysis_id, status) values ($1, 'queued')
								 on conflict (analysis_id) do update set status = 'queued', error_code = null, requested_at = now(), ready_at = null
								 returning ${COLUMNS}`,
								[analysisId]
							);
							return { export: toExport(row!), started: true };
						})
					),
				claim: (analysisId) =>
					one(`update analysis_exports set status = 'processing' where analysis_id = $1 and status in ('queued', 'processing') returning ${COLUMNS}`, [analysisId]),
				markReady: (analysisId, out) =>
					db
						.query(`update analysis_exports set status = 'ready', output_key = $2, size_bytes = $3, error_code = null, ready_at = now() where analysis_id = $1`, [analysisId, out.outputKey, out.sizeBytes])
						.pipe(Effect.asVoid),
				markFailed: (analysisId, errorCode) =>
					db.query(`update analysis_exports set status = 'failed', error_code = $2 where analysis_id = $1 and status in ('queued', 'processing')`, [analysisId, errorCode]).pipe(Effect.asVoid)
			});
		})
	);
}
