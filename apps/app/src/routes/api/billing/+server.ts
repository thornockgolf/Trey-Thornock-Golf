import type { RequestHandler } from './$types';
import { getBilling } from '#lib/server/billing';
import { runRoute } from '#lib/server/runtime';

/** The player's payment state, read from Postgres. */
export const GET: RequestHandler = (event) => runRoute(event, getBilling);
