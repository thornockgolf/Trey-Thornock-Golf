import type { RequestHandler } from './$types';
import { getDrill, updateDrill } from '#lib/server/plans';
import { runRoute } from '#lib/server/runtime';

/** Coach only. */
export const GET: RequestHandler = (event) => runRoute(event, getDrill);

/** Coach only: change any drill field. */
export const PATCH: RequestHandler = (event) => runRoute(event, updateDrill);
