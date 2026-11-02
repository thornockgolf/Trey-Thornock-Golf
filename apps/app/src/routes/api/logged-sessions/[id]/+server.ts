import type { RequestHandler } from './$types';
import { deleteLoggedSession, updateLoggedSession } from '#lib/server/logged-sessions';
import { runRoute } from '#lib/server/runtime';

/** Player only, own logs only: edit (including attaching or removing the video). */
export const PATCH: RequestHandler = (event) => runRoute(event, updateLoggedSession);

/** Player only, own logs only: delete. The linked video stays in their library. */
export const DELETE: RequestHandler = (event) => runRoute(event, deleteLoggedSession);
