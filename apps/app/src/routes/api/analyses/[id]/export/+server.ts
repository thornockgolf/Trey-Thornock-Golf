import type { RequestHandler } from './$types';
import { getExport, requestExport } from '#lib/server/analysis-export';
import { runRoute } from '#lib/server/runtime';

/** Coach only: ask for the flattened export of an analysis (202), and read where it stands with its download link. */
export const POST: RequestHandler = async (event) => {
	const res = await runRoute(event, requestExport);
	return res.ok ? new Response(res.body, { status: 202, headers: res.headers }) : res;
};
export const GET: RequestHandler = (event) => runRoute(event, getExport);
