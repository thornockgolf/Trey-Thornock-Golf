import type { RequestHandler } from './$types';
import { createDrill, listDrills } from '#lib/server/plans';
import { runRoute } from '#lib/server/runtime';

/** Coach only: the drill library. */
export const GET: RequestHandler = (event) => runRoute(event, listDrills);

/** Coach only: add a drill. */
export const POST: RequestHandler = (event) => runRoute(event, createDrill);
