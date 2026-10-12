import type { RequestHandler } from './$types';
import { setSessionItemCompleted } from '#lib/server/plans';
import { runRoute } from '#lib/server/runtime';

/** Player, own sessions only: check a drill off (`{ completed: true }`) or undo it. */
export const PATCH: RequestHandler = (event) => runRoute(event, setSessionItemCompleted);
