import type { RequestHandler } from './$types';
import { runRoute } from '#lib/server/runtime';
import { searchAll } from '#lib/server/search';

/** Coach only: the global search. */
export const GET: RequestHandler = (event) => runRoute(event, searchAll);
